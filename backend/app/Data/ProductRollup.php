<?php

namespace App\Data;

use App\Models\Product;

/** A product's totals across every facility in a rollup node. */
final class ProductRollup
{
    public int $quantityOnHand = 0;

    public int $usableQuantity = 0;

    public int $expiredQuantity = 0;

    public int $facilitiesNeedingReorder = 0;

    public readonly FlagCounts $facilityCounts;

    public function __construct(public readonly Product $product)
    {
        $this->facilityCounts = new FlagCounts;
    }

    public function add(ProductStock $stock): void
    {
        $this->quantityOnHand += $stock->quantityOnHand;
        $this->usableQuantity += $stock->usableQuantity;
        $this->expiredQuantity += $stock->expiredQuantity;
        $this->facilityCounts->add($stock->flags);
        $this->facilitiesNeedingReorder += (int) $stock->needsReorder();
    }
}
