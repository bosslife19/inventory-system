<?php

namespace App\Policies;

use App\Models\State;
use App\Models\User;
use App\Support\HierarchyScope;

class StatePolicy
{
    /** The state's LGA list (and, in Phase 3, its rollup). */
    public function view(User $user, State $state): bool
    {
        return HierarchyScope::for($user)->canViewState($state);
    }
}
