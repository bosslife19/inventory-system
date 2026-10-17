<?php

namespace App\Http\Resources;

use App\Data\StockLevels;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One product's levels at one facility: its own if set, else the catalog's.
 * The resource is `['product' => Product, 'own' => FacilityProductLevel|null]`.
 */
class ProductLevelResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Product $product */
        $product = $this->resource['product'];
        /** @var FacilityProductLevel|null $own */
        $own = $this->resource['own'];
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
        ];
    }
}
