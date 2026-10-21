<?php

namespace App\Enums;

enum UserRole: string
{
    case SdpStaff = 'sdp_staff';
    case LgaOfficer = 'lga_officer';
    case StateOfficer = 'state_officer';
    case FederalOfficer = 'federal_officer';
    case Admin = 'admin';
    /** Runs the platform: manages organizations and their plans. Belongs to no organization and sees none of their data. */
    case Owner = 'owner';

    /** The users column anchoring this role in the hierarchy; null for federal officers, admins and the owner. */
    public function nodeColumn(): ?string
    {
        return match ($this) {
            self::SdpStaff => 'facility_id',
            self::LgaOfficer => 'lga_id',
            self::StateOfficer => 'state_id',
            self::FederalOfficer, self::Admin, self::Owner => null,
        };
    }

    /** @return list<self> the roles inside an organization — every one but the owner */
    public static function organizationRoles(): array
    {
        return array_values(array_filter(self::cases(), fn (self $role) => $role !== self::Owner));
    }
}
