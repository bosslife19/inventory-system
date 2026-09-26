<?php

namespace App\Data;

use App\Enums\AlertType;

/** How many items (products, or facilities in a rollup) carry each flag. */
final class FlagCounts
{
    public int $stockOut = 0;

    public int $expired = 0;

    public int $lowStock = 0;

    public int $expiringSoon = 0;

    /** @param  list<AlertType>  $flags */
    public function add(array $flags): void
    {
        foreach ($flags as $flag) {
            match ($flag) {
                AlertType::StockOut => $this->stockOut++,
                AlertType::Expired => $this->expired++,
                AlertType::LowStock => $this->lowStock++,
                AlertType::ExpiringSoon => $this->expiringSoon++,
            };
        }
    }

    /** Worst-first sort key: stock-outs outrank expired, which outrank low, then expiring. */
    public function severityKey(): array
    {
        return [$this->stockOut, $this->expired, $this->lowStock, $this->expiringSoon];
    }

    /** @return array{stock_out: int, expired: int, low_stock: int, expiring_soon: int} */
    public function toArray(): array
    {
        return [
            'stock_out' => $this->stockOut,
            'expired' => $this->expired,
            'low_stock' => $this->lowStock,
            'expiring_soon' => $this->expiringSoon,
        ];
    }
}
