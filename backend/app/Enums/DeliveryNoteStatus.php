<?php

namespace App\Enums;

enum DeliveryNoteStatus: string
{
    case Draft = 'draft';
    case Confirmed = 'confirmed';
    case Rejected = 'rejected';
}
