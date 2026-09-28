<?php

namespace App\Policies;

use App\Models\State;
use App\Models\User;
use App\Support\HierarchyScope;

class StatePolicy
{
    /** The state's LGA list and its stock rollup. */
    public function view(User $user, State $state): bool
    {
        return HierarchyScope::for($user)->canViewState($state);
    }

    /** The national rollup: federal officers and admins. */
    public function viewNational(User $user): bool
    {
        return HierarchyScope::for($user)->isNational();
    }
}
