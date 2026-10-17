<?php

namespace App\Enums;

enum ReorderRequestStatus: string
{
    case Pending = 'pending';
    case Fulfilled = 'fulfilled';
    case Rejected = 'rejected';
    case Cancelled = 'cancelled';
}
