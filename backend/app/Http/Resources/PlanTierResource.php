<?php

namespace App\Http\Resources;

use App\Models\PlanTier;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A paid plan tier: price and limits. Every tier unlocks the same paid features.
 *
 * @mixin PlanTier
 */
class PlanTierResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            /** Whole naira a month. */
            'monthly_price' => $this->monthly_price,
            /** Open facilities (SDPs); null = no limit. */
            'max_facilities' => $this->max_facilities,
            /** Active accounts, every role together; null = no limit. */
            'max_accounts' => $this->max_accounts,
            /** Offered to organizations; withdrawn tiers stay on organizations already on them until they lapse. */
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
        ];
    }
}
