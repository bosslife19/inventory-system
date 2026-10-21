<?php

namespace App\Http\Middleware;

use App\Enums\Feature;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Routes on the paid plan: 402 with code feature_unavailable (and which
 * feature) when the caller's organization's plan doesn't include it.
 * Usage: ->middleware(RequireFeature::class.':rollups').
 */
class RequireFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $feature = Feature::from($feature);

        if (! $request->user()->organization?->hasFeature($feature)) {
            return response()->json([
                'message' => "{$feature->label()} are part of the paid plan. Ask the platform owner to upgrade your organization.",
                'code' => 'feature_unavailable',
                'feature' => $feature->value,
            ], 402);
        }

        return $next($request);
    }
}
