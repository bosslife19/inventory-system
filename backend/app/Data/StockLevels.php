<?php

namespace App\Data;

use App\Models\FacilityProductLevel;
use App\Models\Product;

/**
 * The min / EOP / max a product is judged against at one facility: the
 * facility's own (facility_product_levels) when it has set them, else the
 * catalog's. Order: EOP < min ≤ max — alerts fire at the EOP, "below min"
 * means time to order.
 */
final readonly class StockLevels
{
    public function __construct(
        public int $min,
        public int $eop,
        public int $max,
        /** 'facility' when the facility set its own, else 'catalog'. */
        public string $source,
    ) {}

    public static function resolve(Product $product, ?FacilityProductLevel $own): self
    {
        return $own
            ? new self($own->min_stock_level, $own->reorder_level, $own->max_stock_level, 'facility')
            : new self($product->min_stock_level, $product->reorder_level, $product->max_stock_level, 'catalog');
    }

    /** Null when the three read EOP < min ≤ max (EOP 0 allowed with min 0), else the field at fault and why. */
    public static function orderError(int $min, int $eop, int $max): ?array
    {
        return match (true) {
            $eop >= $min && ! ($eop === 0 && $min === 0) => ['reorder_level', 'The EOP must be lower than the minimum level.'],
            $max < $min => ['max_stock_level', 'The maximum level can’t be below the minimum level.'],
            default => null,
        };
    }
}
