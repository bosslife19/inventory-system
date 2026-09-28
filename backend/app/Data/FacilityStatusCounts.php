<?php

namespace App\Data;

/** Facilities in a rollup by their most serious issue, each counted once (RollupService::facilityStatus). */
final class FacilityStatusCounts
{
    /** @var array<string, int> */
    private array $counts = ['stock_out' => 0, 'low_stock' => 0, 'reorder' => 0, 'ok' => 0, 'no_data' => 0];

    public function add(string $status): void
    {
        $this->counts[$status]++;
    }

    /** @return array{stock_out: int, low_stock: int, reorder: int, ok: int, no_data: int} */
    public function toArray(): array
    {
        return $this->counts;
    }
}
