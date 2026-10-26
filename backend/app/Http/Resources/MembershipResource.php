<?php

namespace App\Http\Resources;

use App\Enums\Feature;
use App\Models\Organization;
use App\Support\PlanLimits;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in member's organization, as GET /auth/me returns it: what the
 * clients need to show its logo and lock what the plan doesn't include.
 *
 * @mixin Organization
 */
class MembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $daysLeft = $this->daysLeft();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'logo_url' => $this->logoUrl(),
            /** The plan in force today. */
            'plan' => $this->effectivePlan(),
            /**
             * The paid tier in force today (its limits); null on the free plan, or a paid plan without limits.
             *
             * @var array{id: int, name: string, max_facilities: int|null, max_accounts: int|null}|null
             */
            'tier' => ($tier = $this->effectiveTier()) ? [
                'id' => $tier->id, 'name' => $tier->name, 'max_facilities' => $tier->max_facilities, 'max_accounts' => $tier->max_accounts,
            ] : null,
            /** Last day of the paid plan (Y-m-d); null = no end date, or on the free plan. */
            'paid_until' => $daysLeft === null ? null : $this->paid_until?->toDateString(),
            /** Days left on the paid plan, today included; null when it has no end date or isn't paid. */
            'days_left' => $daysLeft,
            /**
             * True from RENEWAL_WARNING_DAYS out: clients show a "renew" notice.
             *
             * @var bool
             */
            'renewal_due' => $daysLeft !== null && $daysLeft <= Organization::RENEWAL_WARNING_DAYS,
            /**
             * What the plan unlocks; anything absent answers 402 feature_unavailable.
             *
             * @var list<'bulk_imports'|'delivery_scanning'|'multiple_accounts'|'multiple_facilities'|'push_notifications'|'supply_chain'>
             */
            'features' => array_map(fn (Feature $f) => $f->value, $this->features()),
            /**
             * The plan's limits and what already uses them. Free plan: the roles
             * with an active account (one each) and whether the one open facility
             * exists. Paid tier: max_accounts (every role together) and
             * max_facilities, null where it has none. Null when the plan has no
             * limits at all. For warnings only; the API re-checks (402).
             *
             * @var array{roles_in_use: list<'sdp_staff'|'lga_officer'|'state_officer'|'federal_officer'|'admin'>, facility_in_use: bool, max_accounts: int|null, accounts_in_use: int, max_facilities: int|null, facilities_in_use: int}|null
             */
            'limits' => PlanLimits::usage($this->resource),
        ];
    }
}
