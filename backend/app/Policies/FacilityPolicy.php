<?php

namespace App\Policies;

use App\Models\Facility;
use App\Models\User;
use App\Support\HierarchyScope;

class FacilityPolicy
{
    /** Facility details and its current stock balances. */
    public function view(User $user, Facility $facility): bool
    {
        return HierarchyScope::for($user)->canViewFacility($facility);
    }
}
