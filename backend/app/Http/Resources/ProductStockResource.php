<?php

namespace App\Http\Resources;

use App\Data\ProductStock;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ProductStock */
class ProductStockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'product' => ProductResource::make($this->product),
            /**
             * The min / EOP / max judged against here: months of AMC when the product has one
             * (`source: "amc"`, with the `amc` used), else this facility's own fixed levels
             * (`source: "facility"`), else the catalog's (`source: "catalog"`). EOP < min ≤ max.
             *
             * @var array{min_stock_level: int, reorder_level: int, max_stock_level: int, source: 'amc'|'facility'|'catalog', amc: float|null}
             */
            'levels' => [
                'min_stock_level' => $this->levels->min,
                'reorder_level' => $this->levels->eop,
                'max_stock_level' => $this->levels->max,
                'source' => $this->levels->source,
                'amc' => $this->levels->amc,
            ],
            /** Sum of stock_balances.quantity_on_hand across batches, including expired stock. */
            'quantity_on_hand' => $this->quantityOnHand,
            /** On hand minus expired batches; thresholds are judged on this. */
            'usable_quantity' => $this->usableQuantity,
            'expired_quantity' => $this->expiredQuantity,
            'expiring_soon_quantity' => $this->expiringSoonQuantity,
            'level' => $this->level,
            /** Most severe first. */
            'flags' => $this->flags,
            /** Earliest expiry first. */
            'batches' => BatchStockResource::collection($this->batches),
        ];
    }
}
