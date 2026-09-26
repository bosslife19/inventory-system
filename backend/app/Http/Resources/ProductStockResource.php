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
