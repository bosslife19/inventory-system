<?php

namespace App\Http\Resources;

use App\Models\DeliveryNote;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin DeliveryNote */
class DeliveryNoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'facility_id' => $this->facility_id,
            'delivery_note_no' => $this->delivery_note_no,
            'source' => $this->source,
            'received_date' => $this->received_date->toDateString(),
            'status' => $this->status,
            /** @var 'manual'|'ocr' */
            'capture_method' => $this->capture_method,
            'comments' => $this->comments,
            'client_reference' => $this->client_reference,
            'created_by_name' => $this->creator->name,
            'confirmed_by_name' => $this->confirmer?->name,
            'confirmed_at' => $this->confirmed_at,
            'rejected_by_name' => $this->rejecter?->name,
            'rejected_at' => $this->rejected_at,
            'rejection_reason' => $this->rejection_reason,
            'created_at' => $this->created_at,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => [
                    'id' => $item->product->id,
                    'name' => $item->product->name,
                    'sku' => $item->product->sku,
                    'unit_of_measure' => $item->product->unit_of_measure,
                ],
                'batch_no' => $item->batch_no,
                'expiry_date' => $item->expiry_date?->toDateString(),
                'quantity' => $item->quantity,
                /** The receipt this line became, once confirmed. */
                'stock_transaction_id' => $item->stock_transaction_id,
            ])->all(),
        ];
    }
}
