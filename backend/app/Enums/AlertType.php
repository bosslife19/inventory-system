<?php

namespace App\Enums;

/** Same values as alerts.alert_type in docs/DATABASE_SCHEMA.md. */
enum AlertType: string
{
    case StockOut = 'stock_out';
    case Expired = 'expired';
    case LowStock = 'low_stock';
    case ExpiringSoon = 'expiring_soon';
}
