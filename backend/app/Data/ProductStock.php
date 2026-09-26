<?php

namespace App\Data;

use App\Enums\AlertType;
use App\Enums\StockLevel;
use App\Models\Product;

/** A product's stock at one facility, summed across its batches. */
final readonly class ProductStock
{
    /**
     * @param  list<BatchStock>  $batches  earliest expiry first
     * @param  list<AlertType>  $flags  most severe first
     */
    public function __construct(
        public Product $product,
        public array $batches,
        public int $quantityOnHand,
        public int $usableQuantity,
        public int $expiredQuantity,
        public int $expiringSoonQuantity,
        public StockLevel $level,
        public array $flags,
    ) {}

    public function hasFlag(AlertType $flag): bool
    {
        return in_array($flag, $this->flags, true);
    }

    /** At or below the emergency order point (EOP), including low and stocked-out. */
    public function needsReorder(): bool
    {
        return $this->level !== StockLevel::Ok;
    }
}
