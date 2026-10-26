<?php

namespace App\Support;

use App\Enums\Feature;
use App\Enums\UserRole;
use App\Exceptions\FeatureUnavailable;
use App\Exceptions\PlanLimitReached;
use App\Models\Facility;
use App\Models\Organization;
use App\Models\User;

/**
 * How many accounts and facilities a plan allows (docs/ROLES_AND_PERMISSIONS.md,
 * "Plans"). The free plan: one active account per role and one open facility
 * (SDP), answered with 402 feature_unavailable. A paid tier: up to its
 * max_accounts active accounts (every role together) and max_facilities open
 * SDPs, answered with 402 plan_limit_reached. A paid plan without a tier has
 * no limits. Stores never count.
 *
 * Only adding goes through here: an organization already past a limit (say,
 * after a lapsed or smaller plan) keeps what it has, and deactivating or
 * closing one frees the slot. The platform owner's console isn't limited.
 */
final class PlanLimits
{
    /**
     * What the limits already use, so clients can warn before a form is
     * filled in; null when the plan has no limits.
     *
     * @return array{roles_in_use: list<UserRole>, facility_in_use: bool, max_accounts: int|null, accounts_in_use: int, max_facilities: int|null, facilities_in_use: int}|null
     */
    public static function usage(Organization $organization): ?array
    {
        $free = self::onFreePlan($organization);
        $tier = $organization->effectiveTier();
        if (! $free && ($tier === null || ($tier->max_accounts === null && $tier->max_facilities === null))) {
            return null;
        }

        $facilities = self::openFacilities($organization)->count();

        return [
            'roles_in_use' => $free ? self::activeAccounts($organization)->distinct()->orderBy('role')->pluck('role')->toArray() : [],
            'facility_in_use' => $free && $facilities > 0,
            'max_accounts' => $free ? null : $tier->max_accounts,
            'accounts_in_use' => self::activeAccounts($organization)->count(),
            'max_facilities' => $free ? 1 : $tier->max_facilities,
            'facilities_in_use' => $facilities,
        ];
    }

    /** Before creating, reactivating or changing the role of an account; $user is the account being changed, if any. */
    public static function ensureAccountAllowed(Organization $organization, UserRole $role, ?User $user = null): void
    {
        if (self::onFreePlan($organization)) {
            $taken = self::activeAccounts($organization)->where('role', $role)
                ->when($user, fn ($q) => $q->whereKeyNot($user->id))
                ->exists();

            if ($taken) {
                $label = $role === UserRole::SdpStaff ? 'facility staff' : str_replace('_', ' ', $role->value);
                throw new FeatureUnavailable(Feature::MultipleAccounts,
                    "The free plan has one {$label} account, and it’s already in use. Deactivate it first, or upgrade your organization to a paid plan for more.");
            }

            return;
        }

        $max = $organization->effectiveTier()?->max_accounts;
        // An active account changing role takes no new place.
        if ($max === null || ($user && $user->is_active)) {
            return;
        }

        if (self::activeAccounts($organization)->when($user, fn ($q) => $q->whereKeyNot($user->id))->count() >= $max) {
            throw new PlanLimitReached('accounts', $max,
                "Your {$organization->effectiveTier()->name} plan allows {$max} active accounts, and they’re all in use. Deactivate one first, or move to a bigger plan.");
        }
    }

    /** Before adding or reopening a facility; $facility is the one being reopened, if any. */
    public static function ensureFacilityAllowed(Organization $organization, ?Facility $facility = null): void
    {
        $free = self::onFreePlan($organization);
        $max = $free ? 1 : $organization->effectiveTier()?->max_facilities;
        if ($max === null) {
            return;
        }

        if (self::openFacilities($organization)->when($facility, fn ($q) => $q->whereKeyNot($facility->id))->count() < $max) {
            return;
        }

        if ($free) {
            throw new FeatureUnavailable(Feature::MultipleFacilities,
                'The free plan has one facility, and it’s already open. Close it first, or upgrade your organization to a paid plan for more.');
        }

        throw new PlanLimitReached('facilities', $max,
            "Your {$organization->effectiveTier()->name} plan allows {$max} open facilities, and they’re all in use. Close one first, or move to a bigger plan.");
    }

    private static function onFreePlan(Organization $organization): bool
    {
        return ! $organization->hasFeature(Feature::MultipleAccounts);
    }

    private static function activeAccounts(Organization $organization)
    {
        return User::query()->where('organization_id', $organization->id)->where('is_active', true);
    }

    private static function openFacilities(Organization $organization)
    {
        return Facility::query()->where('organization_id', $organization->id)->servicePoints()->where('is_active', true);
    }
}
