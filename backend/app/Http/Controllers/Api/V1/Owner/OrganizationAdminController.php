<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Organization;
use App\Models\User;
use App\Services\OrganizationService;
use App\Services\UserAdminService;
use App\Support\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * An organization's admin accounts, as the platform owner manages them:
 * the owner hands each one its sign-in details, and the admins create
 * everyone else themselves.
 */
class OrganizationAdminController extends Controller
{
    public function index(Organization $organization): AnonymousResourceCollection
    {
        return UserResource::collection($organization->admins()->orderBy('name')->get());
    }

    /** Add an admin on a temporary password, returned once. */
    public function store(Request $request, Organization $organization, OrganizationService $organizations): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
        ]);

        [$admin, $password] = $organizations->addAdmin($organization, $data, $request->user());

        return response()->json([
            'data' => UserResource::make($admin),
            /** Give this to the admin with their email; they must change it at first sign-in. */
            'temporary_password' => $password,
        ], 201);
    }

    /** Deactivate or reactivate an admin (deactivating signs them out everywhere). */
    public function update(Request $request, Organization $organization, User $user, UserAdminService $accounts): UserResource
    {
        $this->ensureAdmin($user);
        $data = $request->validate(['is_active' => ['required', 'boolean']]);

        return UserResource::make(Tenant::run($organization, fn () => $accounts->update($user, $data)));
    }

    /** New temporary password for an admin who lost theirs; signs them out everywhere. */
    public function resetPassword(Organization $organization, User $user, UserAdminService $accounts): JsonResponse
    {
        $this->ensureAdmin($user);

        return response()->json([
            'data' => UserResource::make($user),
            /** Give this to the admin; they must change it at their next sign-in. */
            'temporary_password' => Tenant::run($organization, fn () => $accounts->resetPassword($user)),
        ]);
    }

    private function ensureAdmin(User $user): void
    {
        abort_unless($user->role === UserRole::Admin, 404);
    }
}
