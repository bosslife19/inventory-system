<?php

namespace App\Exceptions;

use App\Enums\Feature;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * The organization's plan doesn't include $feature: answers 402 with code
 * feature_unavailable (and which feature), like RequireFeature.
 */
class FeatureUnavailable extends RuntimeException
{
    public function __construct(public readonly Feature $feature, ?string $message = null)
    {
        parent::__construct($message ?? self::defaultMessage($feature));
    }

    public static function response(Feature $feature, ?string $message = null): JsonResponse
    {
        return response()->json([
            'message' => $message ?? self::defaultMessage($feature),
            'code' => 'feature_unavailable',
            'feature' => $feature->value,
        ], 402);
    }

    public function render(): JsonResponse
    {
        return self::response($this->feature, $this->getMessage());
    }

    private static function defaultMessage(Feature $feature): string
    {
        return "{$feature->label()} are part of the paid plan. Ask the platform owner to upgrade your organization.";
    }
}
