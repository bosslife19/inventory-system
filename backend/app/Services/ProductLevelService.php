<?php

namespace App\Services;

use App\Models\Facility;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * A facility's own min / EOP / max and entered AMC per product, set one at
 * a time (Stock levels page) or many (bulk import). Callers validate and
 * authorize first.
 */
class ProductLevelService
{
    public function __construct(
        private readonly AlertEngine $alerts,
        private readonly StockStatusSnapshot $snapshot,
    ) {}

    /**
     * Thresholds move the product's status and alerts, so refresh them unless
     * $deferDerived (a bulk import refreshes once it commits, via refreshDerived()).
     *
     * @param  array{min_stock_level: int, reorder_level: int, max_stock_level: int}  $levels
     */
    public function setLevels(Facility $facility, Product $product, array $levels, User $by, bool $deferDerived = false): FacilityProductLevel
    {
        $own = DB::transaction(function () use ($facility, $product, $levels, $by) {
            $own = FacilityProductLevel::firstOrNew(['facility_id' => $facility->id, 'product_id' => $product->id]);
            $before = $own->exists ? $own : $product;
            $before = [$before->min_stock_level, $before->reorder_level, $before->max_stock_level];
            $own->fill([...$levels, 'updated_by' => $by->id])->save();

            $changes = [];
            foreach (['min_stock_level', 'reorder_level', 'max_stock_level'] as $i => $field) {
                if ($before[$i] !== $own->{$field}) {
                    $changes[$field] = [$before[$i], $own->{$field}];
                }
            }
            AuditLog::record('product.levels_set',
                "Stock levels for {$product->sku} at {$facility->name}: min {$own->min_stock_level}, EOP {$own->reorder_level}, max {$own->max_stock_level}",
                $product, $facility, changes: $changes, actor: $by);

            return $own;
        });

        if (! $deferDerived) {
            $this->refreshDerived($facility, $product->id);
        }

        return $own;
    }

    public function setAmc(Facility $facility, Product $product, float $quantity, User $by): FacilityProductAmc
    {
        return DB::transaction(function () use ($facility, $product, $quantity, $by) {
            $amc = FacilityProductAmc::firstOrNew(['facility_id' => $facility->id, 'product_id' => $product->id]);
            $before = $amc->exists ? $amc->amc_quantity : null;
            $amc->fill(['amc_quantity' => $quantity, 'updated_by' => $by->id])->save();

            AuditLog::record('product.amc_entered', "Entered AMC for {$product->sku} at {$facility->name}: {$amc->amc_quantity} a month",
                $product, $facility, changes: $before === $amc->amc_quantity ? [] : ['amc_quantity' => [$before, $amc->amc_quantity]], actor: $by);

            return $amc;
        });
    }

    /** Derived state: best effort, as after a ledger write (the daily stock:refresh-status pass catches up). */
    public function refreshDerived(Facility $facility, int $productId): void
    {
        foreach ([
            fn () => $this->alerts->evaluate($facility, $productId),
            fn () => $this->snapshot->refresh($facility, $productId),
        ] as $derived) {
            try {
                $derived();
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
