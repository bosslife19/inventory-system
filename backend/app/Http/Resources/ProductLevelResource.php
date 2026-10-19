<?php

namespace App\Http\Resources;

use App\Data\StockLevels;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One product's levels at one facility: its own if set, else the catalog's.
 * The resource is `['product' => Product, 'own' => FacilityProductLevel|null, 'amc' => FacilityProductAmc|null]`.
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

        return [
            'product' => ProductResource::make($product),
            'min_stock_level' => $levels->min,
            /** The EOP in force here. */
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
        ];
    }
}
