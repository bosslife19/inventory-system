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
        $this->loadMissing(['lga.state', 'state']);
        $state = $this->state ?? $this->lga?->state;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'phone' => $this->phone,
            'is_active' => $this->is_active,
            /** Null for SDPs; otherwise which node's store this is. */
            'store_level' => $this->store_level,
            /** Null for state and national stores. */
            'lga' => $this->lga ? ['id' => $this->lga->id, 'name' => $this->lga->name] : null,
            /** Null only for the national store. */
            'state' => $state ? ['id' => $state->id, 'name' => $state->name] : null,
        ];
    }
}
