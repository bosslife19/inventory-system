<?php

namespace App\Enums;

enum UserRole: string
{
    case SdpStaff = 'sdp_staff';
    case LgaOfficer = 'lga_officer';
    case StateOfficer = 'state_officer';
    case FederalOfficer = 'federal_officer';
    case Admin = 'admin';

    /** The users column anchoring this role in the hierarchy; null for federal officers and admins. */
    public function nodeColumn(): ?string
    {
        return match ($this) {
            self::SdpStaff => 'facility_id',
            self::LgaOfficer => 'lga_id',
            self::StateOfficer => 'state_id',
            self::FederalOfficer, self::Admin => null,
        };
    }
}
