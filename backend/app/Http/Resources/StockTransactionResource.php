<?php

namespace App\Http\Resources;

use App\Models\StockTransaction;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StockTransaction */
class StockTransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'facility_id' => $this->facility_id,
            'product_id' => $this->product_id,
            'batch_id' => $this->batch_id,
            'batch_no' => $this->batch?->batch_no,
            'expiry_date' => $this->batch?->expiry_date?->toDateString(),
            'transaction_date' => $this->transaction_date->toDateString(),
            'transaction_type' => $this->transaction_type,
            'quantity' => $this->quantity,
            'running_balance' => $this->running_balance,
            'voucher_no' => $this->voucher_no,
            'counterparty' => $this->counterparty,
            'comments' => $this->comments,
            'performed_by' => $this->performed_by,
            'performed_by_name' => $this->performer->name,
            'product_name' => $this->product->name,
            'delivery_note_id' => $this->delivery_note_id,
            'created_at' => $this->created_at,
        ];
    }
}
