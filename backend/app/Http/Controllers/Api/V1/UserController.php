<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserCollection;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\UserAdminService;
use App\Support\HierarchyScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Managing other people's accounts: admins everyone, each officer the
 * level below in their area (UserPolicy). Temporary passwords are returned
 * once, in the response that set them, and never stored in plain text.
 */
class UserController extends Controller
{
    private const RELATIONS = ['facility.lga.state', 'lga.state', 'state'];

    /** Accounts the caller manages, by name. */
    public function index(Request $request, HierarchyScope $scope): UserCollection
    {
        Gate::authorize('viewAny', User::class);

        if ($request->has('is_active')) {
            $request->merge(['is_active' => filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $request->query('is_active')]);
        }
        $filters = $request->validate([
            'role' => ['nullable', Rule::enum(UserRole::class)],
            'is_active' => ['nullable', 'boolean'],
            /** Name or email contains. */
            'q' => ['nullable', 'string', 'max:100'],
            'facility_id' => ['nullable', 'integer'],
            'lga_id' => ['nullable', 'integer'],
            'state_id' => ['nullable', 'integer'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $users = $scope->scopeManagedUsers(User::query())
            ->with(self::RELATIONS)
            ->when($filters['role'] ?? null, fn ($q, $role) => $q->where('role', $role))
            ->when(isset($filters['is_active']), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($filters['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%")))
            ->when($filters['facility_id'] ?? null, fn ($q, $id) => $q->where('facility_id', $id))
            ->when($filters['lga_id'] ?? null, fn ($q, $id) => $q->where('lga_id', $id))
            ->when($filters['state_id'] ?? null, fn ($q, $id) => $q->where('state_id', $id))
            ->orderBy('name')
            ->paginate($filters['per_page'] ?? 25);

        return new UserCollection($users);
    }

    /** Create an account on a temporary password (generated unless given), returned once. */
    public function store(StoreUserRequest $request, UserAdminService $admin): JsonResponse
    {
        [$user, $password] = $admin->create($request->validated(), $request->user(), $request->input('temporary_password'));

        return response()->json([
            'data' => UserResource::make($user->load(self::RELATIONS)),
            /**
             * Give this to the person; they must change it at first sign-in. Not retrievable later.
             *
             * @var string
             */
            'temporary_password' => $password,
        ], 201);
    }

    /** Change name, email, role / node, or deactivate (signs the account out everywhere). */
    public function update(UpdateUserRequest $request, User $user, UserAdminService $admin): UserResource
    {
        return UserResource::make($admin->update($user, $request->validated())->load(self::RELATIONS));
    }

    /** Set a new temporary password and sign the account out everywhere. */
    public function resetPassword(User $user, UserAdminService $admin): JsonResponse
    {
        Gate::authorize('update', $user);

        $password = $admin->resetPassword($user);

        return response()->json([
            'data' => UserResource::make($user->load(self::RELATIONS)),
            /** Give this to the person; they must change it at their next sign-in. */
            'temporary_password' => $password,
        ]);
    }
}
