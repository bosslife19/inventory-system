<?php

namespace App\Services\Paystack;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * The two Paystack calls billing needs (https://paystack.com/docs/api/transaction):
 * start a checkout, and ask how one went. Plus checking a webhook's
 * signature, which Paystack makes with the same secret key.
 */
class PaystackClient
{
    public function configured(): bool
    {
        return filled(config('services.paystack.secret_key'));
    }

    /**
     * Start a checkout; the payer is sent to the returned authorization_url.
     *
     * @param  array<string, mixed>  $metadata
     * @return array{authorization_url: string, access_code: string, reference: string}
     */
    public function initialize(string $email, int $amountKobo, string $reference, string $callbackUrl, array $metadata = []): array
    {
        $data = $this->call(fn (PendingRequest $http) => $http->post('/transaction/initialize', [
            'email' => $email,
            'amount' => $amountKobo,
            'currency' => 'NGN',
            'reference' => $reference,
            'callback_url' => $callbackUrl,
            'metadata' => $metadata,
        ]));

        return [
            'authorization_url' => $data['authorization_url'],
            'access_code' => $data['access_code'],
            'reference' => $data['reference'],
        ];
    }

    /**
     * How a transaction went: Paystack's `data` (status success|failed|abandoned|…,
     * amount in kobo, currency, channel, id, paid_at, gateway_response).
     *
     * @return array<string, mixed>
     */
    public function verify(string $reference): array
    {
        return $this->call(fn (PendingRequest $http) => $http->get('/transaction/verify/'.rawurlencode($reference)));
    }

    /** A webhook is Paystack's when its x-paystack-signature is the HMAC-SHA512 of the raw body. */
    public function validSignature(string $payload, ?string $signature): bool
    {
        return $this->configured() && $signature !== null
            && hash_equals(hash_hmac('sha512', $payload, (string) config('services.paystack.secret_key')), $signature);
    }

    /** @return array<string, mixed> */
    private function call(callable $send): array
    {
        if (! $this->configured()) {
            throw new PaystackException('Online payment isn’t set up yet. Ask the platform owner.', 503);
        }

        $http = Http::baseUrl((string) config('services.paystack.base_url'))
            ->withToken((string) config('services.paystack.secret_key'))
            ->acceptJson()->asJson()->timeout(20);

        try {
            $response = $send($http);
        } catch (ConnectionException) {
            throw new PaystackException('Couldn’t reach Paystack. Try again in a moment.');
        }

        if (! $response->successful() || $response->json('status') !== true) {
            throw new PaystackException('Paystack refused the request: '.($response->json('message') ?? "HTTP {$response->status()}"));
        }

        return (array) $response->json('data');
    }
}
