<?php

namespace App\Http\Middleware;

use App\Support\HierarchyScope;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the caller's HierarchyScope once per request and binds it in the
 * container, so controllers type-hint HierarchyScope and filter every list
 * query through it. Client-sent ids (?facility_id= etc.) only ever narrow
 * within this scope — see docs/API_CONTRACT.md.
 */
class ScopeToHierarchy
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($user = $request->user()) {
            app()->instance(HierarchyScope::class, HierarchyScope::for($user));
        }

        return $next($request);
    }
}
