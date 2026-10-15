<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

/**
 * See docs/ROLES_AND_PERMISSIONS.md. Recording is limited to sdp_staff at
 * their own facility, officers at their own LGA / state / national store,
 * plus admin. Everything else an officer can see is read-only.
 */
class StockTransactionPolicy
{
    /** Ledger history for a facility: anyone whose scope contains it. */
    public function viewAny(User $user, Facility $facility): bool
    {
        return HierarchyScope::for($user)->canViewFacility($facility);
    }

    public function create(User $user, Facility $facility): Response
    {
        if (! $facility->is_active) {
            return Response::deny('This facility is inactive.');
        }

        if (HierarchyScope::for($user)->canOperate($facility)) {
            return Response::allow();
        }

        return Response::deny(match ($user->role) {
            UserRole::SdpStaff => 'You can only record transactions for your own facility.',
            default => 'You can only record transactions for your own store.',
        });
    }
}
