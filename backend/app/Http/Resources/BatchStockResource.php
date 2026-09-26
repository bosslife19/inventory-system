<?php

namespace App\Http\Resources;

use App\Data\BatchStock;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin BatchStock */
class BatchStockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'batch_id' => $this->batch?->id,
            'batch_no' => $this->batch?->batch_no,
            'expiry_date' => $this->batch?->expiry_date->toDateString(),
            'expiry_status' => $this->expiryStatus,
            'quantity_on_hand' => $this->quantityOnHand,
            'last_transaction_id' => $this->lastTransactionId,
        ];
    }
}
