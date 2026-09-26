<?php

namespace App\Http\Resources;

use App\Models\Facility;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Facility */
class FacilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->loadMissing('lga.state');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'phone' => $this->phone,
            'is_active' => $this->is_active,
            'lga' => ['id' => $this->lga->id, 'name' => $this->lga->name],
            'state' => ['id' => $this->lga->state->id, 'name' => $this->lga->state->name],
        ];
    }
}
