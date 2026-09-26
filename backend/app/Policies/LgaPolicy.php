<?php

namespace App\Policies;

use App\Models\Lga;
use App\Models\User;
use App\Support\HierarchyScope;

class LgaPolicy
{
    /** The LGA's facility list and its stock rollup. */
    public function view(User $user, Lga $lga): bool
    {
        return HierarchyScope::for($user)->canViewLga($lga);
    }
}
