<?php

namespace App\Enums;

/** Same values as alerts.alert_type in docs/DATABASE_SCHEMA.md. */
enum AlertType: string
{
    case StockOut = 'stock_out';
    case Expired = 'expired';
    case LowStock = 'low_stock';
    case ExpiringSoon = 'expiring_soon';

    public function severity(): AlertSeverity
    {
        return match ($this) {
            self::StockOut, self::Expired => AlertSeverity::Critical,
            self::LowStock => AlertSeverity::Warning,
            self::ExpiringSoon => AlertSeverity::Info,
        };
    }

    /** Expiry alerts are raised per batch; stock-level alerts per product. */
    public function isPerBatch(): bool
    {
        return $this === self::Expired || $this === self::ExpiringSoon;
    }
}
