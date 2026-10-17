<?php

namespace App\Enums;

/**
 * The unit a product is counted in on the Stock Card — every quantity for
 * that product is a number of these. Container units (pack, box, carton…)
 * also record how many pieces each one holds (products.pack_size).
 */
enum UnitOfMeasure: string
{
    case Piece = 'piece';
    case Tablet = 'tablet';
    case Capsule = 'capsule';
    case Sachet = 'sachet';
    case Ampoule = 'ampoule';
    case Vial = 'vial';
    case Bottle = 'bottle';
    case Tube = 'tube';
    case Pair = 'pair';
    case Roll = 'roll';
    case Pack = 'pack';
    case Box = 'box';
    case Carton = 'carton';
    case Bag = 'bag';
    case Kit = 'kit';

    /** Holds several pieces, so the product must say how many. */
    public function isContainer(): bool
    {
        return in_array($this, [self::Pack, self::Box, self::Carton, self::Bag, self::Kit], true);
    }
}
