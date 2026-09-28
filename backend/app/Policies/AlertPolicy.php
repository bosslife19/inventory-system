<?php

namespace App\Policies;

use App\Models\Alert;
use App\Models\User;
use App\Support\HierarchyScope;

/**
 * Anyone whose scope contains the alert's facility can see it and act on it
 * (acknowledge / resolve): facility staff and the officers above them
 * follow up on the same alerts. See docs/ROLES_AND_PERMISSIONS.md.
 */
class AlertPolicy
{
    public function view(User $user, Alert $alert): bool
    {
        return HierarchyScope::for($user)->canViewFacility($alert->facility);
    }

    public function update(User $user, Alert $alert): bool
    {
        return $this->view($user, $alert);
    }
}
