<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\OrganizationService;
use App\Support\AccountMail;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    /**
     * Exchange credentials for a Sanctum bearer token.
     *
     * @unauthenticated
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
            /** Label for the token, e.g. "web" or a phone model. */
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        // Before any Tenant is set: whoever it is, in whichever organization.
        $user = User::withoutGlobalScope(User::ORGANIZATION_SCOPE)->where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'The provided credentials are incorrect.']);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages(['email' => 'This account has been deactivated. Ask whoever manages your account.']);
        }

        if ($user->organization && ! $user->organization->is_active) {
            throw ValidationException::withMessages(['email' => 'Your organization’s access has been suspended. Contact the platform owner.']);
        }

        $device = $credentials['device_name'] ?? 'web';
        $token = $user->createToken($device)->plainTextToken;
        AuditLog::record('auth.signed_in', "{$user->name} signed in ({$device})", $user, AuditLog::placeOfUser($user), actor: $user);

        return response()->json([
            'data' => [
                'token' => $token,
                'user' => UserResource::make($user),
            ],
        ]);
    }

    /**
     * Sign up: creates a new organization on the free plan with you as its
     * admin, and signs you in. A link to confirm your email is sent to it;
     * until you use it, every other endpoint answers 403
     * email_verification_required (`email_verified` is false).
     *
     * @unauthenticated
     */
    public function register(Request $request, OrganizationService $organizations): JsonResponse
    {
        $data = $request->validate([
            /** Your organization (e.g. a state ministry, an NGO or a programme). */
            'organization_name' => ['required', 'string', 'max:255'],
            /** Your own name. */
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:30'],
            /** At least 8 characters. */
            'password' => ['required', 'string', 'min:8', 'max:100', 'confirmed'],
            /** Label for the token, e.g. "web" or a phone model. */
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        [, $user] = $organizations->signUp($data);
        $token = $user->createToken($data['device_name'] ?? 'web')->plainTextToken;

        return response()->json([
            'data' => [
                'token' => $token,
                'user' => UserResource::make($user),
            ],
        ], 201);
    }

    /** Revoke the token used for this request. */
    public function logout(Request $request): Response
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    /**
     * Change your own password — required before anything else while on a
     * temporary one. Other devices are signed out; this one stays signed in.
     */
    public function changePassword(Request $request): UserResource
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string', 'current_password:sanctum'],
            /** At least 8 characters, not the current one. */
            'password' => ['required', 'string', 'min:8', 'max:100', 'confirmed', 'different:current_password'],
        ]);

        $user = $request->user();
        $wasTemporary = $user->must_change_password;
        $user->update([
            'password' => $validated['password'],
            'must_change_password' => false,
            // Signing in with the temporary password emailed to them proves the address is theirs.
            'email_verified_at' => $user->email_verified_at ?? ($wasTemporary ? now() : null),
        ]);
        AuditLog::record(
            'user.password_changed',
            "{$user->name} ".($wasTemporary ? 'set their own password, replacing a temporary one' : 'changed their password'),
            $user, AuditLog::placeOfUser($user),
        );

        $current = $user->currentAccessToken();
        $user->tokens()->when($current instanceof PersonalAccessToken, fn ($q) => $q->whereKeyNot($current->getKey()))->delete();

        return UserResource::make($user);
    }

    /** Send the email-confirmation link again (after signing up). Throttled to 3 per 10 minutes. */
    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->needsEmailVerification()) {
            return response()->json(['message' => 'Your email is already confirmed.']);
        }

        AccountMail::verifyEmail($user);

        return response()->json(['message' => "We’ve sent a new link to {$user->email}."], 202);
    }

    /**
     * The link in the confirmation email. Confirms the address and sends the
     * browser on to the web app's /email-verified page with
     * ?status=verified|already|expired|invalid.
     *
     * @unauthenticated
     */
    public function verifyEmail(Request $request, int $user, string $hash): RedirectResponse
    {
        $to = fn (string $status) => redirect()->away(config('app.frontend_url')."/email-verified?status={$status}");
        $account = User::withoutGlobalScope(User::ORGANIZATION_SCOPE)->find($user);

        if (! $account || ! hash_equals(sha1($account->email), $hash)) {
            return $to('invalid');
        }
        if (! $request->hasValidSignature()) {
            return $to($account->email_verified_at ? 'already' : 'expired');
        }
        if ($account->email_verified_at) {
            return $to('already');
        }

        $account->update(['email_verified_at' => now()]);
        AuditLog::record('user.email_verified', "{$account->name} confirmed their email ({$account->email})", $account, AuditLog::placeOfUser($account), actor: $account);

        return $to('verified');
    }

    /** The current user, their role, and the hierarchy node they are anchored at. */
    public function me(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }
}
