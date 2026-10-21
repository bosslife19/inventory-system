<?php

namespace App\Http\Middleware;

use App\Support\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** The owner's console (/owner/*): the platform owner only. */
class EnsureOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()->isOwner()) {
            return response()->json(['message' => 'Only the platform owner can manage organizations.'], 403);
        }

        // Across every organization: no Tenant filters what the console reads.
        return Tenant::run(null, fn () => $next($request));
    }
}
