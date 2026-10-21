<?php

namespace App\Imports;

use App\Enums\UserRole;
use App\Http\Requests\StoreUserRequest;
use App\Models\Facility;
use App\Models\User;
use App\Services\UserAdminService;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;

/**
 * New accounts on temporary passwords, as POST /users: admins any, each
 * officer the level below in their area. The passwords come back once, in
 * the response of the import that created them.
 */
class UserImporter extends Importer
{
    /** Spreadsheet-friendly role names. */
    private const ROLES = [
        'facility_staff' => UserRole::SdpStaff,
        'sdp' => UserRole::SdpStaff,
        'staff' => UserRole::SdpStaff,
        'lga' => UserRole::LgaOfficer,
        'state' => UserRole::StateOfficer,
        'federal' => UserRole::FederalOfficer,
    ];

    public function __construct(private readonly UserAdminService $admin) {}

    public function columns(): array
    {
        return [
            new ImportColumn('name', true, 'Full name.', 'Amina Bello'),
            new ImportColumn('email', true, 'Used to sign in; unique.', 'amina.bello@example.com'),
            new ImportColumn('role', true, 'sdp_staff (facility staff), lga_officer, state_officer, federal_officer or admin — only the roles you may create.', 'sdp_staff'),
            new ImportColumn('state', false, 'State name. Needed for every role except federal_officer and admin.', 'Kaduna', 'state_id'),
            new ImportColumn('lga', false, 'LGA name. Needed for sdp_staff and lga_officer.', 'Kaduna North', 'lga_id'),
            new ImportColumn('facility', false, 'Facility name in that LGA. Needed for sdp_staff.', 'Kawo PHC', 'facility_id'),
            new ImportColumn('temporary_password', false, 'At least 8 characters. Leave blank to have one generated. Either way it must be changed at first sign-in.', ''),
        ];
    }

    public function authorize(User $user, ?Facility $facility): Response
    {
        return HierarchyScope::for($user)->canManageUsers() ? Response::allow() : Response::deny('You can’t create accounts.');
    }

    public function import(array $row, User $user, ?Facility $facility): array
    {
        $slug = self::slug($row['role']);
        $role = self::ROLES[$slug] ?? UserRole::tryFrom((string) $slug);
        $data = [
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => $role?->value ?? $row['role'],
            'temporary_password' => $row['temporary_password'] ?? null,
        ];
        $state = $row['state'] ?? null;
        $lga = $row['lga'] ?? null;
        match ($role) {
            UserRole::SdpStaff => $data['facility_id'] = FacilityImporter::findFacility($state, $lga, $row['facility'] ?? null)->id,
            UserRole::LgaOfficer => $data['lga_id'] = FacilityImporter::findLga($state, $lga)->id,
            UserRole::StateOfficer => $data['state_id'] = FacilityImporter::findState($state)->id,
            default => null,
        };

        $request = $this->validate(StoreUserRequest::class, $data, $user);
        [$created, $password] = $this->admin->create($request->validated(), $user, $request->input('temporary_password'));

        return ['label' => "{$created->name} ({$created->email})", 'temporary_password' => $password];
    }
}
