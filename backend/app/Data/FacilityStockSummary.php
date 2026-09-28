<?php

namespace App\Data;

use App\Models\Facility;

/** One facility row in a rollup drill-down list. */
final readonly class FacilityStockSummary
{
    /** @param  list<ProductStock>  $products */
    public function __construct(
        public Facility $facility,
        public array $products,
        public FlagCounts $flagCounts,
        public ?string $lastTransactionDate = null,
    ) {}

    /** @return list<ProductStock> */
    public function flaggedProducts(): array
    {
        return array_values(array_filter($this->products, fn (ProductStock $p) => $p->flags !== [] || $p->needsReorder()));
    }
}
