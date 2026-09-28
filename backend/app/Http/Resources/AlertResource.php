<?php

namespace App\Http\Resources;

use App\Models\Alert;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Alert */
class AlertResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'alert_type' => $this->alert_type,
            'severity' => $this->severity,
            'status' => $this->status,
            /** False once the stock situation that raised the alert has cleared. */
            'condition_active' => $this->condition_cleared_at === null,
            'facility' => [
                'id' => $this->facility->id,
                'name' => $this->facility->name,
            ],
            'product' => [
                'id' => $this->product->id,
                'name' => $this->product->name,
                'sku' => $this->product->sku,
                'unit_of_measure' => $this->product->unit_of_measure,
            ],
            /** Set for expiry alerts only. */
            'batch' => $this->batch_id === null ? null : [
                'id' => $this->batch->id,
                'batch_no' => $this->batch->batch_no,
                'expiry_date' => $this->batch->expiry_date->toDateString(),
            ],
            'created_at' => $this->created_at,
            'acknowledged_at' => $this->acknowledged_at,
            'acknowledged_by_name' => $this->acknowledger?->name,
            'resolved_at' => $this->resolved_at,
            /** Null when resolved automatically because the condition cleared. */
            'resolved_by_name' => $this->resolver?->name,
        ];
    }
}
