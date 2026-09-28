<?php

namespace App\Http\Resources;

use App\Data\FacilityStockSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin FacilityStockSummary */
class FacilityStockSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'level' => 'facility',
            'id' => $this->facility->id,
            'name' => $this->facility->name,
            'type' => $this->facility->type,
            'is_active' => $this->facility->is_active,
            'product_count' => count($this->products),
            /** Date of the facility's most recent Stock Card entry, if any. */
            'last_transaction_date' => $this->lastTransactionDate,
            /** Number of this facility's products carrying each flag. */
            'flag_counts' => $this->flagCounts->toArray(),
            /** Products at or below reorder level (includes low stock and stock-outs). */
            'needs_reorder_count' => count(array_filter($this->products, fn ($p) => $p->needsReorder())),
            /** Products with any flag or at/below reorder level. */
            'flagged_products' => ProductStockResource::collection($this->flaggedProducts()),
        ];
    }
}
