<?php

namespace App\Services\Paystack;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** Paystack couldn't be reached, refused a call, or isn't configured: 502 (or 503), code payment_gateway_error. */
class PaystackException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 502)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => 'payment_gateway_error'], $this->status);
    }
}
