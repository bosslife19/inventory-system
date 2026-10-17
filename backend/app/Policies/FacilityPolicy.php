<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

class FacilityPolicy
{
    /** Facility details and its current stock balances. */
    public function view(User $user, Facility $facility): bool
    {
        return HierarchyScope::for($user)->canViewFacility($facility);
    }

    /** Its own min / EOP / max per product: whoever keeps its Stock Card (own SDP, own store), or an admin. */
    public function setLevels(User $user, Facility $facility): Response
    {
        if (HierarchyScope::for($user)->canOperate($facility)) {
            return Response::allow();
        }

        return Response::deny(match ($user->role) {
            UserRole::SdpStaff => 'You can only set stock levels for your own facility.',
            default => 'You can only set stock levels for your own store.',
        });
    }
}
