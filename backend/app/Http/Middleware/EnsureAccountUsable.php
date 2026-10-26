<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A deactivated account's tokens stop working at once (401), and so do
 * those of a suspended organization's members. An account
 * still on a temporary password can only read itself, sign out and change
 * the password until it does (403, code password_change_required) — so a
 * password someone else knows is never the one doing the work. Someone who
 * signed up and hasn't confirmed their email yet is held the same way
 * (403, code email_verification_required).
 */
class EnsureAccountUsable
{
    /** Routes a user on a temporary password may still call. */
    private const ALLOWED_WHILE_TEMPORARY = ['api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/password'];

    /** Routes someone who hasn't confirmed their email may still call. */
    private const ALLOWED_WHILE_UNVERIFIED = ['api/v1/auth/me', 'api/v1/auth/logout', 'api/v1/auth/email/resend'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Deactivating revokes every token too (UserAdminService); this covers any in flight.
        if ($user && ! $user->is_active) {
            return response()->json(['message' => 'This account has been deactivated.'], 401);
        }

        if ($user?->organization && ! $user->organization->is_active) {
            return response()->json(['message' => 'Your organization’s access has been suspended.', 'code' => 'organization_inactive'], 401);
        }

        if ($user && $user->must_change_password && ! $request->is(...self::ALLOWED_WHILE_TEMPORARY)) {
            return response()->json([
                'message' => 'Change your temporary password to continue.',
                'code' => 'password_change_required',
            ], 403);
        }

        if ($user && $user->needsEmailVerification() && ! $request->is(...self::ALLOWED_WHILE_UNVERIFIED)) {
            return response()->json([
                'message' => 'Confirm your email address to continue — use the link we emailed you.',
                'code' => 'email_verification_required',
            ], 403);
        }

        return $next($request);
    }
}
