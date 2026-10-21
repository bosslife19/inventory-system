<?php

namespace App\Services;

use App\Data\BatchStock;
use App\Data\FacilityStockSummary;
use App\Data\FlagCounts;
use App\Data\ProductRollup;
use App\Data\ProductStock;
use App\Data\StockLevels;
use App\Enums\AlertType;
use App\Enums\ExpiryStatus;
use App\Enums\StockLevel;
use App\Models\AmcSnapshot;
use App\Models\Batch;
use App\Models\Facility;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Read-side interpretation of stock_balances: usable vs expired quantity,
 * threshold level, and flags. Display-only — nothing here is written back.
 *
 * Thresholds are judged on *usable* stock (unexpired batches), since expired
 * stock on the shelf can't be dispensed. Expired stock is flagged separately.
 * Levels come from the AMC where there is one (StockLevels), else each
 * facility's own fixed levels, else the catalog's.
 */
class StockStatusService
{
    private readonly CarbonImmutable $today;

    private readonly CarbonImmutable $expiringCutoff;

    public function __construct()
    {
        $this->today = CarbonImmutable::today(config('app.business_timezone'));
        $this->expiringCutoff = $this->today->addDays(config('inventory.expiring_soon_days'));
    }

    /** @return list<ProductStock> ordered by product name */
    public function forFacility(Facility $facility): array
    {
        return $this->forFacilities(collect([$facility]))[$facility->id]->products;
    }

    /**
     * @param  Collection<int, Facility>  $facilities
     * @return array<int, FacilityStockSummary> keyed by facility id
     */
    public function forFacilities(Collection $facilities): array
    {
        $balances = StockBalance::query()
            ->whereIn('facility_id', $facilities->map(fn (Facility $f) => $f->id)->all())
            ->with(['product', 'batch'])
            ->get()
            ->groupBy('facility_id');

        $ownLevels = FacilityProductLevel::query()
            ->whereIn('facility_id', $facilities->map(fn (Facility $f) => $f->id)->all())
            ->get()
            ->keyBy(fn (FacilityProductLevel $l) => "{$l->facility_id}:{$l->product_id}");

        $amcs = $this->effectiveAmcs($facilities->map(fn (Facility $f) => $f->id)->all());

        $lastEntries = StockTransaction::query()
            ->whereIn('facility_id', $facilities->map(fn (Facility $f) => $f->id)->all())
            ->groupBy('facility_id')
            ->selectRaw('facility_id, max(transaction_date) as last_date')
            ->pluck('last_date', 'facility_id');

        $summaries = [];
        foreach ($facilities as $facility) {
            $products = ($balances[$facility->id] ?? collect())
                ->groupBy('product_id')
                ->map(fn (Collection $rows) => $this->productStock(
                    $rows,
                    $ownLevels["{$facility->id}:{$rows->first()->product_id}"] ?? null,
                    $amcs[$facility->id][$rows->first()->product_id]['amc'] ?? null,
                ))
                ->sortBy(fn (ProductStock $p) => $p->product->name)
                ->values()
                ->all();

            $counts = new FlagCounts;
            foreach ($products as $product) {
                $counts->add($product->flags);
            }

            $last = $lastEntries[$facility->id] ?? null;
            $summaries[$facility->id] = new FacilityStockSummary($facility, $products, $counts, $last ? substr($last, 0, 10) : null);
        }

        return $summaries;
    }

    /**
     * The AMC each product's levels are worked out from: the latest monthly
     * snapshot, or the entered starting AMC while that covers less than a
     * full window (ReorderService::effectiveAmc).
     *
     * @param  list<int>  $facilityIds
     * @return array<int, array<int, array{amc: float|null, source: 'computed'|'entered'|null}>> by facility id, then product id
     */
    public function effectiveAmcs(array $facilityIds): array
    {
        $latest = AmcSnapshot::query()
            ->whereIn('facility_id', $facilityIds)
            ->groupBy('facility_id', 'product_id')
            ->selectRaw('facility_id, product_id, max(period_month) as period_month');
        $snapshots = AmcSnapshot::query()
            ->joinSub($latest, 'latest', fn ($j) => $j
                ->on('latest.facility_id', '=', 'amc_snapshots.facility_id')
                ->on('latest.product_id', '=', 'amc_snapshots.product_id')
                ->on('latest.period_month', '=', 'amc_snapshots.period_month'))
            ->get(['amc_snapshots.facility_id', 'amc_snapshots.product_id', 'amc_snapshots.amc_quantity', 'amc_snapshots.months_used']);
        $entered = FacilityProductAmc::whereIn('facility_id', $facilityIds)->get(['facility_id', 'product_id', 'amc_quantity']);

        $inputs = [];
        foreach ($snapshots as $s) {
            $inputs[$s->facility_id][$s->product_id] = [$s->amc_quantity, $s->months_used, null];
        }
        foreach ($entered as $e) {
            $inputs[$e->facility_id][$e->product_id] ??= [null, 0, null];
            $inputs[$e->facility_id][$e->product_id][2] = (float) $e->amc_quantity;
        }

        $result = [];
        foreach ($inputs as $facilityId => $products) {
            foreach ($products as $productId => [$computed, $months, $enteredAmc]) {
                $result[$facilityId][$productId] = ReorderService::effectiveAmc($computed, (int) $months, $enteredAmc);
            }
        }

        return $result;
    }

    /**
     * @param  array<int, FacilityStockSummary>  $summaries
     * @return array{facility_counts: FlagCounts, products: list<ProductRollup>, facilities: list<FacilityStockSummary>}
     */
    public function rollup(array $summaries): array
    {
        $facilityCounts = new FlagCounts;
        $products = [];

        foreach ($summaries as $summary) {
            $facilityFlags = []; // a facility counts once per flag, however many products carry it
            foreach ($summary->products as $stock) {
                ($products[$stock->product->id] ??= new ProductRollup($stock->product))->add($stock);
                foreach ($stock->flags as $flag) {
                    $facilityFlags[$flag->value] = $flag;
                }
            }
            $facilityCounts->add(array_values($facilityFlags));
        }

        usort($products, fn (ProductRollup $a, ProductRollup $b) => $a->product->name <=> $b->product->name);

        $facilities = array_values($summaries);
        usort($facilities, fn (FacilityStockSummary $a, FacilityStockSummary $b) => $b->flagCounts->severityKey() <=> $a->flagCounts->severityKey()
            ?: $a->facility->name <=> $b->facility->name);

        return ['facility_counts' => $facilityCounts, 'products' => $products, 'facilities' => $facilities];
    }

    /** @param  Collection<int, StockBalance>  $rows  one product's balance rows at one facility */
    private function productStock(Collection $rows, ?FacilityProductLevel $ownLevels, ?float $amc): ProductStock
    {
        $product = $rows->first()->product;
        $levels = StockLevels::resolve($product, $ownLevels, $amc);

        $batches = $rows
            ->map(fn (StockBalance $b) => new BatchStock(
                $b->batch,
                $b->quantity_on_hand,
                $b->batch ? $this->expiryStatus($b->batch) : null,
                $b->last_transaction_id,
            ))
            ->sortBy(fn (BatchStock $b) => $b->batch?->expiry_date?->toDateString() ?? '9999')
            ->values();

        $onHand = $batches->sum('quantityOnHand');
        $expired = $batches->where('expiryStatus', ExpiryStatus::Expired)->sum('quantityOnHand');
        $expiringSoon = $batches->where('expiryStatus', ExpiryStatus::ExpiringSoon)->sum('quantityOnHand');
        $usable = $onHand - $expired;

        $level = self::level($usable, $levels);

        $flags = array_values(array_filter([
            $level === StockLevel::StockOut ? AlertType::StockOut : null,
            $expired > 0 ? AlertType::Expired : null,
            $level === StockLevel::LowStock ? AlertType::LowStock : null,
            $expiringSoon > 0 ? AlertType::ExpiringSoon : null,
        ]));

        return new ProductStock($product, $levels, $batches->all(), $onHand, $usable, $expired, $expiringSoon, $level, $flags);
    }

    /** Stock-out at 0; at or below the EOP raises the low-stock alert; below the minimum is time to order. */
    public static function level(int $usable, StockLevels $levels): StockLevel
    {
        return match (true) {
            $usable <= 0 => StockLevel::StockOut,
            $usable <= $levels->eop => StockLevel::LowStock,
            $usable < $levels->min => StockLevel::Reorder,
            default => StockLevel::Ok,
        };
    }

    private function expiryStatus(Batch $batch): ExpiryStatus
    {
        return match (true) {
            $batch->expiry_date->lte($this->today) => ExpiryStatus::Expired,
            $batch->expiry_date->lte($this->expiringCutoff) => ExpiryStatus::ExpiringSoon,
            default => ExpiryStatus::Ok,
        };
    }
}
