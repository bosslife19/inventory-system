<?php

namespace App\Data;

use App\Models\FacilityProductLevel;
use App\Models\Product;

/**
 * The min / EOP / max a product is judged against at one facility. With an
 * AMC (computed, or the facility's entered starting AMC) they are months of
 * it — `inventory.{min,eop,max}_months_of_stock`; without one, the
 * facility's own fixed levels (facility_product_levels), else the catalog's.
 * Order: EOP < min ≤ max — alerts fire at the EOP, "below min" means time
 * to order.
 */
final readonly class StockLevels
{
    public function __construct(
        public int $min,
        public int $eop,
        public int $max,
        /** 'amc' when worked out from the AMC, 'facility' when the facility set its own, else 'catalog'. */
        public string $source,
        /** The AMC they were worked out from ('amc' source only). */
        public ?float $amc = null,
    ) {}

    public static function resolve(Product $product, ?FacilityProductLevel $own, ?float $amc = null): self
    {
        if ($amc !== null && $amc > 0) {
            return self::fromAmc($amc);
        }

        return $own
            ? new self($own->min_stock_level, $own->reorder_level, $own->max_stock_level, 'facility')
            : new self($product->min_stock_level, $product->reorder_level, $product->max_stock_level, 'catalog');
    }

    public static function fromAmc(float $amc): self
    {
        $months = fn (string $level) => (int) ceil($amc * (float) config("inventory.{$level}_months_of_stock"));

        return new self($months('min'), $months('eop'), $months('max'), 'amc', $amc);
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
