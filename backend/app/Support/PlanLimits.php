<?php

namespace App\Support;

use App\Enums\Feature;
use App\Enums\UserRole;
use App\Exceptions\FeatureUnavailable;
use App\Models\Facility;
use App\Models\Organization;
use App\Models\User;

/**
 * The free plan's limits (docs/ROLES_AND_PERMISSIONS.md, "Plans"): one
 * active account per role and one open facility (SDP). Only adding goes
 * through here: an organization already past a limit (say, a lapsed paid
 * plan) keeps what it has, and deactivating or closing one frees the slot.
 * The platform owner's console isn't limited.
 */
final class PlanLimits
{
    /**
     * What the free plan's limits already use, so clients can warn before a
     * form is filled in; null when the plan has no limits.
     *
     * @return array{roles_in_use: list<UserRole>, facility_in_use: bool}|null
     */
    public static function usage(Organization $organization): ?array
    {
        if ($organization->hasFeature(Feature::MultipleAccounts) && $organization->hasFeature(Feature::MultipleFacilities)) {
            return null;
        }

        return [
            'roles_in_use' => $organization->hasFeature(Feature::MultipleAccounts) ? [] : User::query()
                ->where('organization_id', $organization->id)->where('is_active', true)
                ->distinct()->orderBy('role')->pluck('role')->toArray(),
            'facility_in_use' => ! $organization->hasFeature(Feature::MultipleFacilities) && Facility::query()
                ->where('organization_id', $organization->id)->servicePoints()->where('is_active', true)->exists(),
        ];
    }

    /** Before creating, reactivating or changing the role of an account; $user is the account being changed, if any. */
    public static function ensureAccountAllowed(Organization $organization, UserRole $role, ?User $user = null): void
    {
        if ($organization->hasFeature(Feature::MultipleAccounts)) {
            return;
        }

        $taken = User::query()->where('organization_id', $organization->id)
            ->where('role', $role)->where('is_active', true)
            ->when($user, fn ($q) => $q->whereKeyNot($user->id))
            ->exists();

        if ($taken) {
            $label = $role === UserRole::SdpStaff ? 'facility staff' : str_replace('_', ' ', $role->value);
            throw new FeatureUnavailable(Feature::MultipleAccounts,
                "The free plan has one {$label} account, and it’s already in use. Deactivate it first, or ask the platform owner to upgrade your organization for more.");
        }
    }

    /** Before adding or reopening a facility; $facility is the one being reopened, if any. */
    public static function ensureFacilityAllowed(Organization $organization, ?Facility $facility = null): void
    {
        if ($organization->hasFeature(Feature::MultipleFacilities)) {
            return;
        }

        $taken = Facility::query()->where('organization_id', $organization->id)
            ->servicePoints()->where('is_active', true)
            ->when($facility, fn ($q) => $q->whereKeyNot($facility->id))
            ->exists();

        if ($taken) {
            throw new FeatureUnavailable(Feature::MultipleFacilities,
                'The free plan has one facility, and it’s already open. Close it first, or ask the platform owner to upgrade your organization for more.');
        }
    }
}
