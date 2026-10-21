<?php

namespace App\Http\Middleware;

use App\Support\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Everything but sign-in and the owner's console is an organization's own
 * data: only its members may call it (403 code owner_account for the
 * platform owner, who sees no organization's data), and for the length of
 * the request it runs as that organization (Tenant).
 */
class EnsureOrganizationMember
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user->organization_id === null) {
            return response()->json([
                'message' => 'The platform owner’s account manages organizations; it has no Stock Cards of its own.',
                'code' => 'owner_account',
            ], 403);
        }

        return Tenant::run($user->organization_id, fn () => $next($request));
    }
}
