<?php

namespace App\Services;

use App\Data\BatchStock;
use App\Data\FacilityStockSummary;
use App\Data\FlagCounts;
use App\Data\ProductRollup;
use App\Data\ProductStock;
use App\Enums\AlertType;
use App\Enums\ExpiryStatus;
use App\Enums\StockLevel;
use App\Models\Batch;
use App\Models\Facility;
use App\Models\StockBalance;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Read-side interpretation of stock_balances: usable vs expired quantity,
 * threshold level, and flags. Display-only — nothing here is written back.
 *
 * Thresholds are judged on *usable* stock (unexpired batches), since expired
 * stock on the shelf can't be dispensed. Expired stock is flagged separately.
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

        $summaries = [];
        foreach ($facilities as $facility) {
            $products = ($balances[$facility->id] ?? collect())
                ->groupBy('product_id')
                ->map(fn (Collection $rows) => $this->productStock($rows))
                ->sortBy(fn (ProductStock $p) => $p->product->name)
                ->values()
                ->all();

            $counts = new FlagCounts;
            foreach ($products as $product) {
                $counts->add($product->flags);
            }

            $summaries[$facility->id] = new FacilityStockSummary($facility, $products, $counts);
        }

        return $summaries;
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
    private function productStock(Collection $rows): ProductStock
    {
        $product = $rows->first()->product;

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

        $level = match (true) {
            $usable === 0 => StockLevel::StockOut,
            $usable < $product->min_stock_level => StockLevel::LowStock,
            $usable <= $product->reorder_level => StockLevel::Reorder,
            default => StockLevel::Ok,
        };

        $flags = array_values(array_filter([
            $level === StockLevel::StockOut ? AlertType::StockOut : null,
            $expired > 0 ? AlertType::Expired : null,
            $level === StockLevel::LowStock ? AlertType::LowStock : null,
            $expiringSoon > 0 ? AlertType::ExpiringSoon : null,
        ]));

        return new ProductStock($product, $batches->all(), $onHand, $usable, $expired, $expiringSoon, $level, $flags);
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
