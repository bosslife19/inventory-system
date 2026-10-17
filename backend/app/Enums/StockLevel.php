<?php

namespace App\Enums;

/**
 * Where a product's *usable* (unexpired) quantity sits against its
 * thresholds — the Bin Card's Min SL / EOP columns. The EOP (emergency
 * order point) sits below the minimum.
 */
enum StockLevel: string
{
    case StockOut = 'stock_out';      // usable = 0
    case LowStock = 'low_stock';      // usable <= reorder_level (EOP) — raises the low-stock alert
    case Reorder = 'reorder';         // usable < min_stock_level — time to order
    case Ok = 'ok';
}
