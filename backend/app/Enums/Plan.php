<?php

namespace App\Enums;

enum Plan: string
{
    case Free = 'free';
    case Paid = 'paid';

    /** @return list<Feature> */
    public function features(): array
    {
        return match ($this) {
            self::Free => [],
            self::Paid => Feature::cases(),
        };
    }
}
