<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A paid tier's cap on open facilities or active accounts is reached:
 * answers 402 with code plan_limit_reached, which limit and its size.
 * (The free plan's own limits answer feature_unavailable instead.)
 */
class PlanLimitReached extends RuntimeException
{
    /** @param  'accounts'|'facilities'  $limit */
    public function __construct(public readonly string $limit, public readonly int $max, string $message)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => 'plan_limit_reached',
            'limit' => $this->limit,
            'max' => $this->max,
        ], 402);
    }
}
