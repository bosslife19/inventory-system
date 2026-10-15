<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
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

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'The provided credentials are incorrect.']);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages(['email' => 'This account has been deactivated. Ask whoever manages your account.']);
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
        $user->update(['password' => $validated['password'], 'must_change_password' => false]);
        AuditLog::record(
            'user.password_changed',
            "{$user->name} ".($wasTemporary ? 'set their own password, replacing a temporary one' : 'changed their password'),
            $user, AuditLog::placeOfUser($user),
        );

        $current = $user->currentAccessToken();
        $user->tokens()->when($current instanceof PersonalAccessToken, fn ($q) => $q->whereKeyNot($current->getKey()))->delete();

        return UserResource::make($user);
    }

    /** The current user, their role, and the hierarchy node they are anchored at. */
    public function me(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }
}
