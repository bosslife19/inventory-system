<?php

namespace App\Http\Resources;

use App\Enums\Feature;
use App\Models\Organization;
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
             * @var list<'bulk_imports'|'delivery_scanning'|'push_notifications'|'rollups'|'supply_chain'>
             */
            'features' => array_map(fn (Feature $f) => $f->value, $this->features()),
        ];
    }
}
