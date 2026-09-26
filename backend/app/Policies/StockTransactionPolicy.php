<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

/**
 * See docs/ROLES_AND_PERMISSIONS.md. Recording is limited to sdp_staff at
 * their own facility, plus admin; officers are read-only.
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

        return match ($user->role) {
            UserRole::Admin => Response::allow(),
            UserRole::SdpStaff => $user->facility_id === $facility->id
                ? Response::allow()
                : Response::deny('You can only record transactions for your own facility.'),
            default => Response::deny('Your role cannot record stock transactions.'),
        };
    }
}
