<?php

namespace App\Policies;

use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Models\StockTransaction;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;

/**
 * docs/ROLES_AND_PERMISSIONS.md: sdp_staff (own facility) and admin submit,
 * confirm and reject delivery notes — the same people who may record stock
 * transactions there. Anyone whose scope contains the facility can view.
 */
class DeliveryNotePolicy
{
    public function viewAny(User $user, Facility $facility): bool
    {
        return HierarchyScope::for($user)->canViewFacility($facility);
    }

    public function view(User $user, DeliveryNote $note): bool
    {
        return HierarchyScope::for($user)->canViewFacility($note->facility);
    }

    public function create(User $user, Facility $facility): Response
    {
        return Gate::forUser($user)->inspect('create', [StockTransaction::class, $facility]);
    }

    /** Confirm or reject. */
    public function update(User $user, DeliveryNote $note): Response
    {
        return $this->create($user, $note->facility);
    }
}
