<?php

namespace App\Policies;

use App\Enums\StoreLevel;
use App\Models\Facility;
use App\Models\ReorderRequest;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

/**
 * Asking: whoever keeps the requester's Stock Card (own SDP, own store,
 * admin). Answering (fulfil / decline): whoever keeps the store asked.
 * Cancelling: the requester's side. Seeing one: anyone who can see either end.
 */
class ReorderRequestPolicy
{
    public function create(User $user, Facility $facility): Response
    {
        return match (true) {
            ! $facility->is_active => Response::deny('This facility is inactive.'),
            $facility->store_level === StoreLevel::National => Response::deny('The National Store has no store above it to ask.'),
            ! HierarchyScope::for($user)->canOperate($facility) => Response::deny('You can only request stock for your own facility or store.'),
            default => Response::allow(),
        };
    }

    public function view(User $user, ReorderRequest $request): bool
    {
        $scope = HierarchyScope::for($user);

        return $scope->canViewFacility($request->facility) || $scope->canViewFacility($request->supplier);
    }

    public function respond(User $user, ReorderRequest $request): Response
    {
        return HierarchyScope::for($user)->canOperate($request->supplier)
            ? Response::allow()
            : Response::deny('Only the officers who keep '.$request->supplier->name.' can answer this request.');
    }

    public function cancel(User $user, ReorderRequest $request): Response
    {
        return HierarchyScope::for($user)->canOperate($request->facility)
            ? Response::allow()
            : Response::deny('Only the requesting facility can cancel this request.');
    }
}
