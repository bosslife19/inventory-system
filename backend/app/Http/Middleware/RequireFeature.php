<?php

namespace App\Http\Middleware;

use App\Enums\Feature;
use App\Exceptions\FeatureUnavailable;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Routes on the paid plan: 402 with code feature_unavailable (and which
 * feature) when the caller's organization's plan doesn't include it.
 * Usage: ->middleware(RequireFeature::class.':supply_chain').
 */
class RequireFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $feature = Feature::from($feature);

        if (! $request->user()->organization?->hasFeature($feature)) {
            return FeatureUnavailable::response($feature);
        }

        return $next($request);
    }
}
