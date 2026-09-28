<?php

namespace App\Data;

/**
 * One product's reorder position at a facility: the Excel Bin Card summary
 * (AMC / Max SL / Quantity to order) against current usable stock.
 */
final readonly class ReorderSuggestion
{
    /**
     * @param  'amc'|'product_max'  $basis  what max_stock_quantity came from
     */
    public function __construct(
        public ProductStock $stock,
        public ?float $amcQuantity,
        public int $monthsUsed,
        public ?string $amcPeriodMonth,
        public ?float $monthsOfStock,
        public int $maxStockQuantity,
        public string $basis,
        public int $suggestedQuantity,
    ) {}
}
