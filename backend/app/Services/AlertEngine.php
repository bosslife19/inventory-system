<?php

namespace App\Services;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\ExpiryStatus;
use App\Enums\StockLevel;
use App\Models\Alert;
use App\Models\Facility;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Turns the flags StockStatusService computes into alert rows.
 *
 * For each facility it works out which conditions hold right now —
 * stock-out / low stock per product, expired / expiring soon per batch with
 * stock on hand — and reconciles them against the facility's live alerts:
 * a condition with no live alert raises one; a live alert whose condition
 * no longer holds is marked cleared (and resolved, if nobody resolved it).
 *
 * Runs after every ledger write (for that product) and on a schedule (for
 * every facility), since expiry changes with the calendar, not the ledger.
 */
class AlertEngine
{
    public function __construct(private readonly StockStatusService $status) {}

    /**
     * @param  int|null  $productId  limit to one product (after a ledger write)
     * @return array{raised: int, cleared: int}
     */
    public function evaluate(Facility $facility, ?int $productId = null): array
    {
        return DB::transaction(function () use ($facility, $productId) {
            // Same lock as StockLedgerService::record(): balances can't move
            // under us, and two evaluations of one facility can't both raise.
            Facility::whereKey($facility->id)->lockForUpdate()->firstOrFail();

            $active = $this->activeConditions($facility, $productId);

            $live = Alert::query()
                ->where('facility_id', $facility->id)
                ->when($productId, fn ($q) => $q->where('product_id', $productId))
                ->live()
                ->get()
                ->keyBy(fn (Alert $a) => $a->conditionKey());

            $now = CarbonImmutable::now();
            $cleared = 0;
            foreach ($live as $key => $alert) {
                if (isset($active[$key])) {
                    continue;
                }
                $alert->condition_cleared_at = $now;
                if ($alert->status !== AlertStatus::Resolved) {
                    $alert->status = AlertStatus::Resolved;
                    $alert->resolved_at = $now;
                }
                $alert->save();
                $cleared++;
            }

            $raised = 0;
            foreach ($active as $key => [$type, $product, $batch]) {
                if ($live->has($key)) {
                    continue;
                }
                Alert::create([
                    'facility_id' => $facility->id,
                    'product_id' => $product,
                    'batch_id' => $batch,
                    'alert_type' => $type,
                    'severity' => $type->severity(),
                    'status' => AlertStatus::Open,
                ]);
                $raised++;
            }

            return ['raised' => $raised, 'cleared' => $cleared];
        });
    }

    /** @return array<string, array{AlertType, int, int|null}> keyed by Alert::key() */
    private function activeConditions(Facility $facility, ?int $productId): array
    {
        $active = [];
        $add = function (AlertType $type, int $product, ?int $batch) use (&$active) {
            $active[Alert::key($type, $product, $batch)] = [$type, $product, $batch];
        };

        foreach ($this->status->forFacility($facility) as $stock) {
            $id = $stock->product->id;
            if ($productId !== null && $id !== $productId) {
                continue;
            }

            if ($stock->level === StockLevel::StockOut) {
                $add(AlertType::StockOut, $id, null);
            } elseif ($stock->level === StockLevel::LowStock) {
                $add(AlertType::LowStock, $id, null);
            }

            foreach ($stock->batches as $batch) {
                if ($batch->batch === null || $batch->quantityOnHand <= 0) {
                    continue;
                }
                match ($batch->expiryStatus) {
                    ExpiryStatus::Expired => $add(AlertType::Expired, $id, $batch->batch->id),
                    ExpiryStatus::ExpiringSoon => $add(AlertType::ExpiringSoon, $id, $batch->batch->id),
                    default => null,
                };
            }
        }

        return $active;
    }
}
