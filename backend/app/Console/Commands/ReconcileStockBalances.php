<?php

namespace App\Console\Commands;

use App\Models\Facility;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Safety net for stock_balances (docs/ARCHITECTURE.md, "Balance
 * recalculation"): replays each facility's ledger from scratch and corrects
 * any balance row that has drifted. The ledger itself is never modified —
 * running_balance mismatches in history are only reported.
 *
 * Shared hosting has short execution limits, so a run stops after
 * --max-seconds and the next scheduled run resumes from the next facility.
 * Once a full pass completes, further runs that day are no-ops.
 */
class ReconcileStockBalances extends Command
{
    protected $signature = 'stock:reconcile
        {--facility=* : Reconcile only these facility ids (ignores resume state)}
        {--max-seconds=50 : Stop after this many seconds and resume on the next run}
        {--force : Start a new full pass even if one already completed today}';

    protected $description = 'Re-sum stock_transactions and correct drift in stock_balances';

    private const CURSOR_KEY = 'stock:reconcile:cursor';

    private const COMPLETED_KEY = 'stock:reconcile:completed_on';

    public function handle(): int
    {
        $onlyIds = array_map('intval', $this->option('facility'));
        $today = CarbonImmutable::today(config('app.business_timezone'))->toDateString();

        if ($onlyIds === [] && ! $this->option('force') && Cache::get(self::COMPLETED_KEY) === $today) {
            $this->info("Full pass already completed today ({$today}).");

            return self::SUCCESS;
        }

        $deadline = microtime(true) + (int) $this->option('max-seconds');
        $cursor = $onlyIds === [] && ! $this->option('force') ? (int) Cache::get(self::CURSOR_KEY, 0) : 0;
        $totals = ['facilities' => 0, 'corrected' => 0, 'created' => 0, 'deleted' => 0, 'history_mismatches' => 0];

        $facilityIds = Facility::query()
            ->when($onlyIds !== [], fn ($q) => $q->whereKey($onlyIds), fn ($q) => $q->where('id', '>', $cursor))
            ->orderBy('id')
            ->pluck('id');

        foreach ($facilityIds as $facilityId) {
            foreach ($this->reconcileFacility($facilityId) as $key => $count) {
                $totals[$key] += $count;
            }
            $totals['facilities']++;

            if ($onlyIds === []) {
                Cache::forever(self::CURSOR_KEY, $facilityId);
            }

            if (microtime(true) > $deadline && $facilityId !== $facilityIds->last()) {
                $this->report($totals);
                $this->warn("Time budget reached after facility {$facilityId}; the next run resumes from there.");

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

    /** @return array{corrected:int, created:int, deleted:int, history_mismatches:int} */
    private function reconcileFacility(int $facilityId): array
    {
        $counts = ['corrected' => 0, 'created' => 0, 'deleted' => 0, 'history_mismatches' => 0];

        // Same lock as StockLedgerService::record(), so no write lands mid-replay.
        DB::transaction(function () use ($facilityId, &$counts) {
            Facility::whereKey($facilityId)->lockForUpdate()->first();

            $expected = [];      // "product|batch" => [product_id, batch_id, qty, last_tx_id]
            $productTotals = []; // product_id => qty across batches

            $transactions = StockTransaction::query()
                ->where('facility_id', $facilityId)
                ->select(['id', 'product_id', 'batch_id', 'transaction_type', 'quantity', 'running_balance'])
                ->lazyById(1000);

            foreach ($transactions as $tx) {
                $key = $tx->product_id.'|'.$tx->batch_id;
                $current = $expected[$key][2] ?? 0;
                $next = $tx->transaction_type->apply($current, $tx->quantity);

                $expected[$key] = [$tx->product_id, $tx->batch_id, $next, $tx->id];
                $productTotals[$tx->product_id] = ($productTotals[$tx->product_id] ?? 0) - $current + $next;

                if ($tx->running_balance !== $productTotals[$tx->product_id]) {
                    $counts['history_mismatches']++;
                    Log::warning('stock:reconcile running_balance mismatch', [
                        'transaction_id' => $tx->id,
                        'recorded' => $tx->running_balance,
                        'replayed' => $productTotals[$tx->product_id],
                    ]);
                }
            }

            $existing = StockBalance::where('facility_id', $facilityId)->get()
                ->keyBy(fn (StockBalance $b) => $b->product_id.'|'.$b->batch_id);

            foreach ($expected as $key => [$productId, $batchId, $qty, $lastTxId]) {
                $row = $existing->pull($key);

                if ($row === null) {
                    StockBalance::create([
                        'facility_id' => $facilityId,
                        'product_id' => $productId,
                        'batch_id' => $batchId,
                        'quantity_on_hand' => $qty,
                        'last_transaction_id' => $lastTxId,
                    ]);
                    $counts['created']++;
                    Log::warning('stock:reconcile created missing balance', compact('facilityId', 'productId', 'batchId', 'qty'));
                } elseif ($row->quantity_on_hand !== $qty || $row->last_transaction_id !== $lastTxId) {
                    Log::warning('stock:reconcile corrected drift', [
                        'balance_id' => $row->id,
                        'was' => $row->quantity_on_hand,
                        'now' => $qty,
                    ]);
                    $row->update(['quantity_on_hand' => $qty, 'last_transaction_id' => $lastTxId]);
                    $counts['corrected']++;
                }
            }

            // Balance rows with no ledger behind them can't be right.
            foreach ($existing as $orphan) {
                Log::warning('stock:reconcile deleted orphan balance', ['balance_id' => $orphan->id]);
                $orphan->delete();
                $counts['deleted']++;
            }
        });

        return $counts;
    }

    private function report(array $totals): void
    {
        $this->table(array_keys($totals), [array_values($totals)]);
    }
}
