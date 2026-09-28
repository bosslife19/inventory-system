<?php

namespace App\Http\Resources;

use App\Data\AreaStockSummary;
use App\Models\State;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AreaStockSummary */
class AreaStockSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $isState = $this->node instanceof State;

        return [
            /** @var 'lga'|'state' */
            'level' => $isState ? 'state' : 'lga',
            'id' => $this->node->id,
            'name' => $this->node->name,
            /** States only. */
            'geopolitical_zone' => $isState ? $this->node->geopolitical_zone : null,
            'facility_count' => $this->facilityCount,
            /** Facilities with at least one product on the Stock Card. */
            'reporting_facility_count' => $this->reportingFacilityCount,
            /** Number of facilities with at least one product carrying each flag. */
            'flag_counts' => $this->flagCounts,
            /** Facilities with at least one product at or below reorder level. */
            'needs_reorder_count' => $this->needsReorderCount,
            'last_transaction_date' => $this->lastTransactionDate,
            /** Products stocked out at the most facilities here, top 3. */
            'stock_out_products' => $this->stockOutProducts,
        ];
    }
}
