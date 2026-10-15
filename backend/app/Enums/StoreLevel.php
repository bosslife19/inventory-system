<?php

namespace App\Enums;

/** Which hierarchy node a store facility belongs to. SDPs have none. */
enum StoreLevel: string
{
    case Lga = 'lga';
    case State = 'state';
    case National = 'national';
}
