<?php

namespace App\Enums;

enum ExpiryStatus: string
{
    case Ok = 'ok';
    case ExpiringSoon = 'expiring_soon';
    case Expired = 'expired';
}
