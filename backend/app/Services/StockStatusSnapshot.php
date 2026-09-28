<?php

namespace App\Services;

use App\Enums\AlertType;
use App\Models\Facility;
use App\Models\FacilityProductStatus;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Keeps facility_product_status in step with StockStatusService, so rollups
 * above the LGA can aggregate one small row per facility + product instead
 * of every stock_balances row.
 */
class StockStatusSnapshot
{
    public function __construct(private readonly StockStatusService $status) {}

    /** @param  int|null  $productId  limit to one product (after a ledger write) */
    public function refresh(Facility $facility, ?int $productId = null): void
    {
        DB::transaction(function () use ($facility, $productId) {
            // Same lock as the ledger, so balances can't move mid-refresh.
            Facility::whereKey($facility->id)->lockForUpdate()->firstOrFail();

            $lastDates = StockTransaction::query()
                ->where('facility_id', $facility->id)
                ->when($productId, fn ($q) => $q->where('product_id', $productId))
                ->groupBy('product_id')
                ->selectRaw('product_id, max(transaction_date) as last_date')
                ->pluck('last_date', 'product_id');

            $now = CarbonImmutable::now();
            $seen = [];

            foreach ($this->status->forFacility($facility) as $stock) {
                $id = $stock->product->id;
                if ($productId !== null && $id !== $productId) {
                    continue;
                }
                $seen[] = $id;
                $last = $lastDates[$id] ?? null;

                FacilityProductStatus::updateOrCreate(
                    ['facility_id' => $facility->id, 'product_id' => $id],
                    [
                        'quantity_on_hand' => $stock->quantityOnHand,
                        'usable_quantity' => $stock->usableQuantity,
                        'expired_quantity' => $stock->expiredQuantity,
                        'expiring_soon_quantity' => $stock->expiringSoonQuantity,
                        'level' => $stock->level,
                        'flag_stock_out' => $stock->hasFlag(AlertType::StockOut),
                        'flag_expired' => $stock->hasFlag(AlertType::Expired),
                        'flag_low_stock' => $stock->hasFlag(AlertType::LowStock),
                        'flag_expiring_soon' => $stock->hasFlag(AlertType::ExpiringSoon),
                        'last_transaction_date' => $last ? substr($last, 0, 10) : null,
                        'refreshed_at' => $now,
                    ],
                );
            }

            // Products no longer stocked at all (full refresh only).
            if ($productId === null) {
                FacilityProductStatus::where('facility_id', $facility->id)->whereNotIn('product_id', $seen)->delete();
            }
        });
    }
}
