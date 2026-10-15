<?php

namespace App\Support;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * What part of the hierarchy a user can see: their own node and everything
 * beneath it — never above or sideways (docs/ARCHITECTURE.md). Used by the
 * ScopeToHierarchy middleware (to filter lists) and by every policy (to
 * authorize single records), so there is exactly one definition.
 */
final class HierarchyScope
{
    public function __construct(public readonly User $user) {}

    public static function for(User $user): self
    {
        return new self($user);
    }

    public function isNational(): bool
    {
        return in_array($this->user->role, [UserRole::FederalOfficer, UserRole::Admin], true);
    }

    public function canViewState(State $state): bool
    {
        return $this->isNational()
            || ($this->user->role === UserRole::StateOfficer && $this->user->state_id === $state->id);
    }

    public function canViewLga(Lga $lga): bool
    {
        return match ($this->user->role) {
            UserRole::FederalOfficer, UserRole::Admin => true,
            UserRole::StateOfficer => $this->user->state_id === $lga->state_id,
            UserRole::LgaOfficer => $this->user->lga_id === $lga->id,
            UserRole::SdpStaff => false,
        };
    }

    /** SDPs and stores alike: an LGA store is in its LGA, a state store in its state, the national store only national. */
    public function canViewFacility(Facility $facility): bool
    {
        return match ($this->user->role) {
            UserRole::FederalOfficer, UserRole::Admin => true,
            UserRole::StateOfficer => $facility->stateId() !== null && $this->user->state_id === $facility->stateId(),
            UserRole::LgaOfficer => $facility->lga_id !== null && $this->user->lga_id === $facility->lga_id,
            UserRole::SdpStaff => $this->user->facility_id === $facility->id,
        };
    }

    /**
     * The store an officer keeps the Stock Card of; null for SDP staff and
     * admins (admins may record anywhere, but have no store of their own).
     */
    public function ownStore(): ?Facility
    {
        return match ($this->user->role) {
            UserRole::LgaOfficer => Facility::storeForLga($this->user->lga),
            UserRole::StateOfficer => Facility::storeForState($this->user->state),
            UserRole::FederalOfficer => Facility::nationalStore(),
            default => null,
        };
    }

    /** May record Stock Card entries here: SDP staff at their facility, officers at their own store, admins anywhere. */
    public function canOperate(Facility $facility): bool
    {
        return match ($this->user->role) {
            UserRole::Admin => true,
            UserRole::SdpStaff => $this->user->facility_id === $facility->id,
            UserRole::LgaOfficer => $facility->store_key === "lga:{$this->user->lga_id}",
            UserRole::StateOfficer => $facility->store_key === "state:{$this->user->state_id}",
            UserRole::FederalOfficer => $facility->store_key === 'national',
        };
    }

    /** @param Builder<State> $query */
    public function scopeStates(Builder $query): Builder
    {
        return match ($this->user->role) {
            UserRole::FederalOfficer, UserRole::Admin => $query,
            UserRole::StateOfficer => $query->whereKey($this->user->state_id),
            default => $query->whereRaw('1 = 0'),
        };
    }

    /** @param Builder<Lga> $query */
    public function scopeLgas(Builder $query): Builder
    {
        return match ($this->user->role) {
            UserRole::FederalOfficer, UserRole::Admin => $query,
            UserRole::StateOfficer => $query->where('state_id', $this->user->state_id),
            UserRole::LgaOfficer => $query->whereKey($this->user->lga_id),
            UserRole::SdpStaff => $query->whereRaw('1 = 0'),
        };
    }

    /** @param Builder<Facility> $query */
    public function scopeFacilities(Builder $query): Builder
    {
        return match ($this->user->role) {
            UserRole::FederalOfficer, UserRole::Admin => $query,
            UserRole::StateOfficer => $query->where(fn (Builder $q) => $q
                ->whereIn('facilities.lga_id', Lga::select('id')->where('state_id', $this->user->state_id))
                ->orWhere('facilities.state_id', $this->user->state_id)),
            UserRole::LgaOfficer => $query->where('facilities.lga_id', $this->user->lga_id),
            UserRole::SdpStaff => $query->whereKey($this->user->facility_id),
        };
    }
}
