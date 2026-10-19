<?php

namespace App\Services;

use App\Data\ProductStock;
use App\Data\ReorderSuggestion;
use App\Enums\TransactionType;
use App\Models\AmcSnapshot;
use App\Models\Facility;
use App\Models\FacilityProductAmc;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;

/**
 * Average Monthly Consumption and quantity to order — the Excel "Bin Card"
 * summary (docs/ARCHITECTURE.md, data flow step 3).
 *
 * AMC = issues over the last `inventory.amc_months` complete months before
 * the period, divided by the number of those months the product was on the
 * Stock Card. Only `issue` counts as consumption; losses, adjustments and
 * transfers don't. A month the product first appeared part-way through is
 * left out, so new products aren't under-estimated.
 *
 * A facility with less than a full window of its own history (newly
 * onboarded, say) may enter an AMC per product (facility_product_amcs);
 * that figure is used until the window is full, then the computed one.
 *
 * Quantity to order = max stock − usable stock (never negative), where max
 * stock = AMC × `inventory.max_months_of_stock`, or the product's fixed
 * max level (the facility's own, else the catalog's) when there is no
 * consumption history yet.
 */
class ReorderService
{
    public function __construct(private readonly StockStatusService $status) {}

    /**
     * AMC per product for a facility, for the given month.
     *
     * @return array<int, array{amc: float|null, months: int}> keyed by product id
     */
    public function amc(Facility $facility, CarbonImmutable $periodMonth): array
    {
        // Work on plain dates: ledger dates parse as UTC midnight, so a period in
        // another timezone would skew the month counts below.
        $period = CarbonImmutable::parse($periodMonth->format('Y-m-01'));
        $windowStart = $period->subMonths((int) config('inventory.amc_months'));

        $firstEntries = StockTransaction::query()
            ->where('facility_id', $facility->id)
            ->where('transaction_date', '<', $period->toDateString())
            ->groupBy('product_id')
            ->selectRaw('product_id, min(transaction_date) as first_date')
            ->pluck('first_date', 'product_id');

        $issuesByDay = StockTransaction::query()
            ->where('facility_id', $facility->id)
            ->where('transaction_type', TransactionType::Issue)
            ->where('transaction_date', '>=', $windowStart->toDateString())
            ->where('transaction_date', '<', $period->toDateString())
            ->groupBy('product_id', 'transaction_date')
            ->selectRaw('product_id, transaction_date, sum(quantity) as issued')
            ->toBase()
            ->get()
            ->groupBy('product_id');

        $result = [];
        foreach ($firstEntries as $productId => $firstDate) {
            $first = CarbonImmutable::parse(substr($firstDate, 0, 10));
            // First full month on the Stock Card.
            $firstFull = $first->day === 1 ? $first : $first->startOfMonth()->addMonth();
            $start = $firstFull->greaterThan($windowStart) ? $firstFull : $windowStart;
            $months = max(0, (int) $start->diffInMonths($period));

            if ($months === 0) {
                $result[$productId] = ['amc' => null, 'months' => 0];

                continue;
            }

            $issued = ($issuesByDay[$productId] ?? collect())
                ->filter(fn ($row) => substr($row->transaction_date, 0, 10) >= $start->toDateString())
                ->sum('issued');

            $result[$productId] = ['amc' => round($issued / $months, 2), 'months' => $months];
        }

        return $result;
    }

    /**
     * Live suggestions for every product stocked at the facility, from the
     * latest AMC snapshot and current usable stock. Products needing an
     * order come first.
     *
     * @return list<ReorderSuggestion>
     */
    public function suggestions(Facility $facility): array
    {
        $snapshots = AmcSnapshot::query()
            ->where('facility_id', $facility->id)
            ->orderBy('period_month')
            ->get()
            ->keyBy('product_id'); // latest period wins
        $entered = $this->enteredAmcs($facility);

        $suggestions = array_map(function (ProductStock $stock) use ($snapshots, $entered) {
            $snapshot = $snapshots[$stock->product->id] ?? null;

            return $this->suggest(
                $stock,
                $snapshot?->amc_quantity,
                $snapshot?->months_used ?? 0,
                $snapshot?->period_month?->toDateString(),
                $entered[$stock->product->id] ?? null,
            );
        }, $this->status->forFacility($facility));

        usort($suggestions, fn (ReorderSuggestion $a, ReorderSuggestion $b) => ($b->suggestedQuantity > 0) <=> ($a->suggestedQuantity > 0)
            ?: ($a->monthsOfStock ?? INF) <=> ($b->monthsOfStock ?? INF)
            ?: $a->stock->product->name <=> $b->stock->product->name);

        return $suggestions;
    }

    public function suggest(ProductStock $stock, ?float $amc, int $monthsUsed, ?string $periodMonth, ?float $enteredAmc = null): ReorderSuggestion
    {
        ['amc' => $amc, 'source' => $source] = self::effectiveAmc($amc, $monthsUsed, $enteredAmc);
        $plan = self::plan($amc, $stock->levels->max, $stock->usableQuantity);

        return new ReorderSuggestion(
            stock: $stock,
            amcQuantity: $amc,
            amcSource: $source,
            monthsUsed: $monthsUsed,
            amcPeriodMonth: $periodMonth,
            monthsOfStock: $plan['months_of_stock'],
            maxStockQuantity: $plan['max'],
            basis: $plan['basis'],
            suggestedQuantity: $plan['suggested'],
        );
    }

    /** @return array<int, float> entered AMC by product id */
    public function enteredAmcs(Facility $facility): array
    {
        return FacilityProductAmc::where('facility_id', $facility->id)->pluck('amc_quantity', 'product_id')->map(fn ($q) => (float) $q)->all();
    }

    /**
     * The entered AMC while the computed one covers less than the full
     * `inventory.amc_months` window, else the computed one.
     *
     * @return array{amc: float|null, source: 'computed'|'entered'|null}
     */
    public static function effectiveAmc(?float $computed, int $monthsUsed, ?float $entered): array
    {
        if ($entered !== null && $monthsUsed < (int) config('inventory.amc_months')) {
            return ['amc' => $entered, 'source' => 'entered'];
        }

        return ['amc' => $computed, 'source' => $computed === null ? null : 'computed'];
    }

    /**
     * The order arithmetic on its own (also used by the reorder report):
     * max stock from AMC when there is consumption history, else the
     * product's fixed max; order up to it from current usable stock.
     *
     * @return array{max: int, basis: 'amc'|'product_max', suggested: int, months_of_stock: float|null}
     */
    public static function plan(?float $amc, int $productMax, int $usable): array
    {
        $hasAmc = $amc !== null && $amc > 0;
        $max = $hasAmc ? (int) ceil($amc * (float) config('inventory.max_months_of_stock')) : $productMax;

        return [
            'max' => $max,
            'basis' => $hasAmc ? 'amc' : 'product_max',
            'suggested' => max(0, $max - $usable),
            'months_of_stock' => $hasAmc ? round($usable / $amc, 1) : null,
        ];
    }
}
