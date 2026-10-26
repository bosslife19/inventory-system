<?php

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Services\BillingService;
use App\Services\Paystack\PaystackClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Paystack's webhook (set its URL in the Paystack dashboard to
 * {APP_URL}/api/v1/webhooks/paystack). Signed with the secret key; a
 * charge.success settles the payment it names, as the redirect back would.
 * Anything else, or a reference that isn't ours, is acknowledged and ignored.
 */
class PaystackWebhookController extends Controller
{
    /** @unauthenticated */
    public function __invoke(Request $request, PaystackClient $paystack, BillingService $billing): JsonResponse
    {
        if (! $paystack->validSignature($request->getContent(), $request->header('x-paystack-signature'))) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $data = (array) $request->input('data', []);
        if ($request->input('event') === 'charge.success' && isset($data['reference'])) {
            $payment = Payment::query()->where('reference', (string) $data['reference'])->first();
            if ($payment) {
                $billing->settle($payment, $data);
            }
        }

        return response()->json(['received' => true]);
    }
}
