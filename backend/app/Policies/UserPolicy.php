<?php

namespace App\Policies;

use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

/**
 * Account management (docs/ROLES_AND_PERMISSIONS.md): admins manage every
 * account, each officer the accounts one level below in their area. Nobody
 * manages their own account here — they change their password via
 * /auth/password. Which role and node a new account may get is checked in
 * the form requests (HierarchyScope::assignmentError).
 */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return HierarchyScope::for($user)->canManageUsers();
    }

    public function create(User $user): Response
    {
        return HierarchyScope::for($user)->canManageUsers()
            ? Response::allow()
            : Response::deny('Your role can’t create accounts.');
    }

    /** Edit, deactivate, reset the password. */
    public function update(User $user, User $target): Response
    {
        if ($user->is($target)) {
            return Response::deny('You can’t manage your own account here; change your password from your profile.');
        }

        return HierarchyScope::for($user)->canManageUser($target)
            ? Response::allow()
            : Response::deny('That account is outside what you manage.');
    }
}
