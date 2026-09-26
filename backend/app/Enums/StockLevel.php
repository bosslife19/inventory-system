<?php

namespace App\Enums;

/**
 * Where a product's *usable* (unexpired) quantity sits against its
 * thresholds — the Bin Card's Min SL / EOP columns.
 */
enum StockLevel: string
{
    case StockOut = 'stock_out';      // usable = 0
    case LowStock = 'low_stock';      // usable < min_stock_level
    case Reorder = 'reorder';         // usable <= reorder_level (EOP)
    case Ok = 'ok';
}
