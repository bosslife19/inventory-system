<?php

namespace App\Imports;

use App\Enums\UserRole;
use App\Http\Requests\SaveFacilityRequest;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Models\User;
use App\Services\CatalogService;
use Illuminate\Auth\Access\Response;

/** New facilities (SDPs), as POST /facilities. Admins only. */
class FacilityImporter extends Importer
{
    public function __construct(private readonly CatalogService $catalog) {}

    public function columns(): array
    {
        return [
            new ImportColumn('state', true, 'State name, as listed in the system (e.g. Kaduna, FCT).', 'Kaduna'),
            new ImportColumn('lga', true, 'LGA name within that state.', 'Kaduna North', 'lga_id'),
            new ImportColumn('name', true, 'Facility name, unique within its LGA.', 'Kawo PHC'),
            new ImportColumn('type', true, 'health_center, hospital, pharmacy, warehouse or other.', 'health_center'),
            new ImportColumn('address', false, 'Street address.', '12 Kawo Road'),
            new ImportColumn('phone', false, 'Contact phone number.', '08031234567'),
            new ImportColumn('latitude', false, 'Decimal degrees.', '10.5651'),
            new ImportColumn('longitude', false, 'Decimal degrees.', '7.4468'),
        ];
    }

    public function authorize(User $user, ?Facility $facility): Response
    {
        return $user->role === UserRole::Admin ? Response::allow() : Response::deny('Only admins manage facilities.');
    }

    public function import(array $row, User $user, ?Facility $facility): array
    {
        $lga = self::findLga($row['state'], $row['lga']);

        $request = $this->validate(SaveFacilityRequest::class, [
            'lga_id' => $lga->id,
            'name' => $row['name'],
            'type' => self::slug($row['type']),
            'address' => $row['address'] ?? null,
            'phone' => $row['phone'] ?? null,
            'latitude' => $row['latitude'] ?? null,
            'longitude' => $row['longitude'] ?? null,
        ], $user);

        $facility = $this->catalog->addFacility($request->validated());

        return ['label' => "{$facility->name}, {$lga->name} LGA, {$lga->state->name}"];
    }

    /** By name, ignoring case. Shared with the accounts import. */
    public static function findState(?string $name): State
    {
        if ($name === null) {
            self::fail('state', 'Say which state.');
        }
        $plain = preg_replace('/\s+state$/i', '', trim($name));

        return State::whereRaw('LOWER(name) = ?', [strtolower($plain)])->first()
            ?? self::fail('state', "No state called “{$name}”.");
    }

    public static function findLga(?string $state, ?string $lga): Lga
    {
        $state = self::findState($state);
        if ($lga === null) {
            self::fail('lga', 'Say which LGA.');
        }

        return Lga::where('state_id', $state->id)->whereRaw('LOWER(name) = ?', [strtolower(trim($lga))])->with('state')->first()
            ?? self::fail('lga', "No LGA called “{$lga}” in {$state->name}.");
    }

    /** A facility (SDP, not a store) by name in its LGA. */
    public static function findFacility(?string $state, ?string $lga, ?string $name): Facility
    {
        $lga = self::findLga($state, $lga);
        if ($name === null) {
            self::fail('facility', 'Say which facility.');
        }

        return Facility::servicePoints()->where('lga_id', $lga->id)->whereRaw('LOWER(name) = ?', [strtolower(trim($name))])->first()
            ?? self::fail('facility', "No facility called “{$name}” in {$lga->name} LGA.");
    }
}
