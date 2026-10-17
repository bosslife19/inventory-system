<?php

namespace App\Http\Resources;

use App\Models\ReorderRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ReorderRequest */
class ReorderRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** REQ-000123 */
            'number' => $this->number(),
            'status' => $this->status,
            /** Who is asking. */
            'facility' => ['id' => $this->facility->id, 'name' => $this->facility->name, 'store_level' => $this->facility->store_level],
            /** The store asked. */
            'supplier' => ['id' => $this->supplier->id, 'name' => $this->supplier->name, 'store_level' => $this->supplier->store_level],
            'comments' => $this->comments,
            'requested_by_name' => $this->requester?->name,
            'created_at' => $this->created_at,
            'responded_by_name' => $this->responder?->name,
            'responded_at' => $this->responded_at,
            /** Why it was declined, or the note sent with the stock. */
            'response_note' => $this->response_note,
            /**
             * The dispatch that fulfilled it; `status` is the requester's (draft = not yet received).
             *
             * @var array{id: int, delivery_note_no: string|null, status: string}|null
             */
            'delivery_note' => $this->deliveryNote ? [
                'id' => $this->deliveryNote->id,
                'delivery_note_no' => $this->deliveryNote->delivery_note_no,
                'status' => $this->deliveryNote->status->value,
            ] : null,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => [
                    'id' => $item->product->id, 'name' => $item->product->name, 'sku' => $item->product->sku,
                    'unit_of_measure' => $item->product->unit_of_measure, 'pack_size' => $item->product->pack_size,
                    'requires_batch_tracking' => $item->product->requires_batch_tracking,
                ],
                'quantity_requested' => $item->quantity_requested,
                /** Null until fulfilled. */
                'quantity_supplied' => $item->quantity_supplied,
            ])->all(),
        ];
    }
}
