<?php

namespace App\Data;

use App\Models\Lga;
use App\Models\State;

/** One LGA or State row in a State / Federal drill-down list. Counts are facilities. */
final readonly class AreaStockSummary
{
    /**
     * @param  array{stock_out: int, expired: int, low_stock: int, expiring_soon: int}  $flagCounts
     * @param  list<array{product: array{id: int, name: string, sku: string}, facility_count: int}>  $stockOutProducts
     */
    public function __construct(
        public Lga|State $node,
        public int $facilityCount,
        public int $reportingFacilityCount,
        public array $flagCounts,
        public int $needsReorderCount,
        public ?string $lastTransactionDate,
        public array $stockOutProducts,
    ) {}
}
