<?php

namespace App\Enums;

enum UserRole: string
{
    case SdpStaff = 'sdp_staff';
    case LgaOfficer = 'lga_officer';
    case StateOfficer = 'state_officer';
    case FederalOfficer = 'federal_officer';
    case Admin = 'admin';
}
