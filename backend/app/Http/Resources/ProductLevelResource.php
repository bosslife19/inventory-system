<?php

namespace App\Http\Resources;

use App\Data\StockLevels;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One product's fixed levels at one facility (its own if set, else the
 * catalog's), and the AMC-based levels that replace them when it has an AMC.
 * The resource is `['product' => Product, 'own' => FacilityProductLevel|null,
 * 'amc' => FacilityProductAmc|null, 'effective_amc' => float|null]`.
 */
class ProductLevelResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Product $product */
        $product = $this->resource['product'];
        /** @var FacilityProductLevel|null $own */
        $own = $this->resource['own'];
        /** @var FacilityProductAmc|null $amc */
        $amc = $this->resource['amc'] ?? null;
        $levels = StockLevels::resolve($product, $own);
        $effectiveAmc = $this->resource['effective_amc'] ?? null;
        $amcLevels = $effectiveAmc !== null && $effectiveAmc > 0 ? StockLevels::fromAmc($effectiveAmc) : null;

        return [
            'product' => ProductResource::make($product),
            /** The fixed levels: used while the product has no AMC here (see `amc_levels`). */
            'min_stock_level' => $levels->min,
            'reorder_level' => $levels->eop,
            'max_stock_level' => $levels->max,
            /**
             * 'facility' = set here, 'catalog' = the product's defaults.
             *
             * @var 'facility'|'catalog'
             */
            'source' => $levels->source,
            'updated_by_name' => $own?->updater?->name,
            'updated_at' => $own?->updated_at,
            /** AMC entered here for when history is short (null if none); reorder suggestions use it until there's a full AMC window of records. */
            'entered_amc' => $amc ? (float) $amc->amc_quantity : null,
            /**
             * The levels in force when the product has an AMC here (computed, or the entered one while
             * history is short): min / EOP / max = AMC × `INVENTORY_{MIN,EOP,MAX}_MONTHS_OF_STOCK`. Null without an AMC.
             *
             * @var array{amc: float, min_stock_level: int, reorder_level: int, max_stock_level: int}|null
             */
            'amc_levels' => $amcLevels ? [
                'amc' => $amcLevels->amc,
                'min_stock_level' => $amcLevels->min,
                'reorder_level' => $amcLevels->eop,
                'max_stock_level' => $amcLevels->max,
            ] : null,
        ];
    }
}
