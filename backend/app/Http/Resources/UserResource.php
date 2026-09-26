<?php

namespace App\Http\Resources;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $this->loadMissing(['facility.lga.state', 'lga.state', 'state']);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'facility_id' => $this->facility_id,
            'lga_id' => $this->lga_id,
            'state_id' => $this->state_id,
            /**
             * The hierarchy node this account is anchored at; drives which dashboard the client opens.
             *
             * @var array{level: 'facility'|'lga'|'state'|'national', id: int|null, name: string, path: list<string>}
             */
            'node' => $this->node(),
        ];
    }

    /** @return array{level: 'facility'|'lga'|'state'|'national', id: int|null, name: string, path: list<string>} */
    private function node(): array
    {
        return match ($this->role) {
            UserRole::SdpStaff => [
                'level' => 'facility',
                'id' => $this->facility_id,
                'name' => $this->facility->name,
                'path' => [$this->facility->lga->state->name, $this->facility->lga->name, $this->facility->name],
            ],
            UserRole::LgaOfficer => [
                'level' => 'lga',
                'id' => $this->lga_id,
                'name' => $this->lga->name,
                'path' => [$this->lga->state->name, $this->lga->name],
            ],
            UserRole::StateOfficer => [
                'level' => 'state',
                'id' => $this->state_id,
                'name' => $this->state->name,
                'path' => [$this->state->name],
            ],
            default => ['level' => 'national', 'id' => null, 'name' => 'Nigeria', 'path' => ['Nigeria']],
        };
    }
}
