<?php

namespace App\Console\Commands;

use App\Models\AmcSnapshot;
use App\Models\Facility;
use App\Services\ReorderService;
use App\Services\StockStatusService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Writes this month's amc_snapshots rows (the Excel Bin Card summary) for
 * every active facility: AMC over the previous complete months, plus months
 * of stock and quantity to order as they stood at computation time.
 *
 * Like the other scheduled commands, a run stops after --max-seconds and the
 * next run resumes; once every facility is done for the month, further runs
 * are no-ops. Re-running a month (--force) overwrites its rows.
 */
class ComputeMonthlyAmc extends Command
{
    protected $signature = 'stock:compute-amc
        {--month= : Month to compute, YYYY-MM (default: the current month)}
        {--facility=* : Only these facility ids (ignores resume state)}
        {--max-seconds=50 : Stop after this many seconds and resume on the next run}
        {--force : Recompute even if this month is already complete}';

    protected $description = 'Compute Average Monthly Consumption and quantity to order per facility and product';

    private const CURSOR_KEY = 'stock:compute-amc:cursor';

    private const COMPLETED_KEY = 'stock:compute-amc:completed_month';

    public function handle(ReorderService $reorder, StockStatusService $status): int
    {
        $month = $this->option('month')
            ? CarbonImmutable::createFromFormat('!Y-m', $this->option('month'), config('app.business_timezone'))
            : CarbonImmutable::today(config('app.business_timezone'))->startOfMonth();
        $monthKey = $month->format('Y-m');
        $onlyIds = array_map('intval', $this->option('facility'));
        $resumable = $onlyIds === [] && ! $this->option('force');

        if ($resumable && Cache::get(self::COMPLETED_KEY) === $monthKey) {
            $this->info("AMC already computed for {$monthKey}.");

            return self::SUCCESS;
        }

        $deadline = microtime(true) + (int) $this->option('max-seconds');
        $cursor = $resumable ? (int) Cache::get(self::CURSOR_KEY.":{$monthKey}", 0) : 0;
        $totals = ['facilities' => 0, 'products' => 0];

        $facilities = Facility::query()
            ->where('is_active', true)
            ->when($onlyIds !== [], fn ($q) => $q->whereKey($onlyIds), fn ($q) => $q->where('id', '>', $cursor))
            ->orderBy('id')
            ->get();

        foreach ($facilities as $facility) {
            $amc = $reorder->amc($facility, $month);

            DB::transaction(function () use ($facility, $amc, $month, $reorder, $status, &$totals) {
                foreach ($status->forFacility($facility) as $stock) {
                    $row = $amc[$stock->product->id] ?? ['amc' => null, 'months' => 0];
                    $suggestion = $reorder->suggest($stock, $row['amc'], $row['months'], $month->toDateString());

                    AmcSnapshot::updateOrCreate(
                        ['facility_id' => $facility->id, 'product_id' => $stock->product->id, 'period_month' => $month->toDateString()],
                        [
                            'amc_quantity' => $row['amc'],
                            'months_used' => $row['months'],
                            'months_of_stock' => $suggestion->monthsOfStock,
                            'suggested_reorder_quantity' => $suggestion->suggestedQuantity,
                        ],
                    );
                    $totals['products']++;
                }
            });
            $totals['facilities']++;

            if ($resumable) {
                Cache::forever(self::CURSOR_KEY.":{$monthKey}", $facility->id);
            }

            if (microtime(true) > $deadline && $facility->isNot($facilities->last())) {
                $this->report($monthKey, $totals);
                $this->warn("Time budget reached after facility {$facility->id}; the next run resumes from there.");

                return self::SUCCESS;
            }
        }

        if ($onlyIds === []) {
            Cache::forget(self::CURSOR_KEY.":{$monthKey}");
            Cache::forever(self::COMPLETED_KEY, $monthKey);
        }

        $this->report($monthKey, $totals);

        return self::SUCCESS;
    }

    /** @param  array{facilities: int, products: int}  $totals */
    private function report(string $month, array $totals): void
    {
        $this->info("AMC for {$month}: {$totals['facilities']} facilities, {$totals['products']} product rows.");
    }
}
