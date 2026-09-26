<?php

namespace App\Http\Resources;

use App\Data\ProductRollup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ProductRollup */
class ProductRollupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'product' => ProductResource::make($this->product),
            'quantity_on_hand' => $this->quantityOnHand,
            'usable_quantity' => $this->usableQuantity,
            'expired_quantity' => $this->expiredQuantity,
            /** Number of facilities where this product carries each flag. */
            'facility_counts' => $this->facilityCounts->toArray(),
            /** Facilities where this product is at or below reorder level. */
            'facilities_needing_reorder' => $this->facilitiesNeedingReorder,
        ];
    }
}
