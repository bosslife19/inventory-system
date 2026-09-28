<?php

namespace App\Console\Commands;

use App\Models\Facility;
use App\Services\AlertEngine;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Re-evaluates stock alerts for every active facility. Ledger writes already
 * re-evaluate the product they touch; this pass catches what changes with
 * the calendar alone — batches crossing into "expiring soon" or "expired".
 *
 * Like stock:reconcile, a run stops after --max-seconds (shared hosting
 * execution limits) and the next scheduled run resumes from the next
 * facility. Once a full pass completes, further runs that day are no-ops.
 */
class DetectStockAlerts extends Command
{
    protected $signature = 'stock:detect-alerts
        {--facility=* : Evaluate only these facility ids (ignores resume state)}
        {--max-seconds=50 : Stop after this many seconds and resume on the next run}
        {--force : Start a new full pass even if one already completed today}';

    protected $description = 'Raise and auto-resolve stock alerts (stock-out, low stock, expiring, expired)';

    private const CURSOR_KEY = 'stock:detect-alerts:cursor';

    private const COMPLETED_KEY = 'stock:detect-alerts:completed_on';

    public function handle(AlertEngine $engine): int
    {
        $onlyIds = array_map('intval', $this->option('facility'));
        $today = CarbonImmutable::today(config('app.business_timezone'))->toDateString();

        if ($onlyIds === [] && ! $this->option('force') && Cache::get(self::COMPLETED_KEY) === $today) {
            $this->info("Full pass already completed today ({$today}).");

            return self::SUCCESS;
        }

        $deadline = microtime(true) + (int) $this->option('max-seconds');
        $cursor = $onlyIds === [] && ! $this->option('force') ? (int) Cache::get(self::CURSOR_KEY, 0) : 0;
        $totals = ['facilities' => 0, 'raised' => 0, 'cleared' => 0];

        $facilities = Facility::query()
            ->where('is_active', true)
            ->when($onlyIds !== [], fn ($q) => $q->whereKey($onlyIds), fn ($q) => $q->where('id', '>', $cursor))
            ->orderBy('id')
            ->get();

        foreach ($facilities as $facility) {
            $result = $engine->evaluate($facility);
            $totals['raised'] += $result['raised'];
            $totals['cleared'] += $result['cleared'];
            $totals['facilities']++;

            if ($onlyIds === []) {
                Cache::forever(self::CURSOR_KEY, $facility->id);
            }

            if (microtime(true) > $deadline && $facility->isNot($facilities->last())) {
                $this->report($totals);
                $this->warn("Time budget reached after facility {$facility->id}; the next run resumes from there.");

                return self::SUCCESS;
            }
        }

        if ($onlyIds === []) {
            Cache::forget(self::CURSOR_KEY);
            Cache::forever(self::COMPLETED_KEY, $today);
        }

        $this->report($totals);

        return self::SUCCESS;
    }

    /** @param  array{facilities: int, raised: int, cleared: int}  $totals */
    private function report(array $totals): void
    {
        $this->info("Evaluated {$totals['facilities']} facilities: {$totals['raised']} alerts raised, {$totals['cleared']} cleared.");
    }
}
