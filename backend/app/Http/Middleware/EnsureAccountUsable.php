<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A deactivated account's tokens stop working at once (401). An account
 * still on a temporary password can only read itself, sign out and change
 * the password until it does (403, code password_change_required) — so a
 * password someone else knows is never the one doing the work.
 */
class EnsureAccountUsable
{
    /** Routes a user on a temporary password may still call. */
    private const ALLOWED_WHILE_TEMPORARY = ['api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/password'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Deactivating revokes every token too (UserAdminService); this covers any in flight.
        if ($user && ! $user->is_active) {
            return response()->json(['message' => 'This account has been deactivated.'], 401);
        }

        if ($user && $user->must_change_password && ! $request->is(...self::ALLOWED_WHILE_TEMPORARY)) {
            return response()->json([
                'message' => 'Change your temporary password to continue.',
                'code' => 'password_change_required',
            ], 403);
        }

        return $next($request);
    }
}
