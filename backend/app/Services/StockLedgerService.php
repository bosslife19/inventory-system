<?php

namespace App\Services;

use App\Enums\TransactionType;
use App\Models\Batch;
use App\Models\Facility;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The only write path into the stock ledger (see backend/CLAUDE.md rule 1 and
 * "Balance recalculation" in docs/ARCHITECTURE.md).
 *
 * record() runs inline in one DB transaction: lock the facility, resolve the
 * batch, apply the signed delta to the batch's stock_balances row, and insert
 * the stock_transactions row with the facility+product running_balance.
 * Cost is independent of ledger length, so there is no queue involved.
 *
 * State-dependent rules (unknown batch, insufficient stock, back-dating) are
 * enforced here rather than in the FormRequest, because they need the lock
 * and because other callers (delivery note confirmation) must obey them too.
 * They surface as ValidationException, i.e. a normal 422 to the API client.
 */
class StockLedgerService
{
    public function record(
        Facility $facility,
        Product $product,
        TransactionType $type,
        int $quantity,
        CarbonImmutable $transactionDate,
        User $performedBy,
        ?string $batchNo = null,
        ?string $expiryDate = null,
        ?string $voucherNo = null,
        ?string $counterparty = null,
        ?string $comments = null,
        ?int $deliveryNoteId = null,
    ): StockTransaction {
        if ($quantity < 0 || ($quantity === 0 && $type !== TransactionType::PhysicalCount)) {
            $this->fail('quantity', 'Quantity must be greater than zero.');
        }

        return DB::transaction(function () use (
            $facility, $product, $type, $quantity, $transactionDate, $performedBy,
            $batchNo, $expiryDate, $voucherNo, $counterparty, $comments, $deliveryNoteId,
        ) {
            // Serializes all ledger writes for this facility, so running_balance
            // and the "no back-dating" check can't race. Writes to different
            // facilities don't contend.
            Facility::whereKey($facility->id)->lockForUpdate()->firstOrFail();

            $batch = $this->resolveBatch($product, $type, $batchNo, $expiryDate, $transactionDate);
            $this->assertDateAllowed($facility, $product, $transactionDate);

            $balance = StockBalance::query()
                ->where('facility_id', $facility->id)
                ->where('product_id', $product->id)
                ->where('batch_id', $batch?->id)
                ->first();

            $current = $balance?->quantity_on_hand ?? 0;

            if ($type->isOutbound() && $quantity > $current) {
                $this->fail('quantity', "Insufficient stock: {$current} on hand".($batch ? " for batch {$batch->batch_no}" : '').'.');
            }

            $next = $type->apply($current, $quantity);

            $otherBatches = StockBalance::query()
                ->where('facility_id', $facility->id)
                ->where('product_id', $product->id)
                ->when($balance, fn ($q) => $q->whereKeyNot($balance->id))
                ->sum('quantity_on_hand');

            $transaction = StockTransaction::create([
                'facility_id' => $facility->id,
                'product_id' => $product->id,
                'batch_id' => $batch?->id,
                'transaction_date' => $transactionDate->toDateString(),
                'voucher_no' => $voucherNo,
                'counterparty' => $counterparty,
                'transaction_type' => $type,
                'quantity' => $quantity,
                'comments' => $comments,
                'performed_by' => $performedBy->id,
                'delivery_note_id' => $deliveryNoteId,
                'running_balance' => $otherBatches + $next,
            ]);

            $balance ??= new StockBalance([
                'facility_id' => $facility->id,
                'product_id' => $product->id,
                'batch_id' => $batch?->id,
            ]);
            $balance->fill([
                'quantity_on_hand' => $next,
                'last_transaction_id' => $transaction->id,
            ])->save();

            return $transaction->setRelation('batch', $batch);
        });
    }

    private function resolveBatch(
        Product $product,
        TransactionType $type,
        ?string $batchNo,
        ?string $expiryDate,
        CarbonImmutable $transactionDate,
    ): ?Batch {
        if (! $product->requires_batch_tracking) {
            if ($batchNo !== null) {
                $this->fail('batch_no', "{$product->name} is not batch-tracked; omit batch_no.");
            }

            return null;
        }

        if ($batchNo === null) {
            $this->fail('batch_no', "batch_no is required for {$product->name}.");
        }

        $batch = Batch::where('product_id', $product->id)->where('batch_no', $batchNo)->first();

        if ($batch === null) {
            if (! $type->canCreateBatch()) {
                $this->fail('batch_no', "Batch {$batchNo} has never been received for this product.");
            }
            if ($expiryDate === null) {
                $this->fail('expiry_date', "expiry_date is required for new batch {$batchNo}.");
            }

            return Batch::create([
                'product_id' => $product->id,
                'batch_no' => $batchNo,
                'expiry_date' => $expiryDate,
            ]);
        }

        if ($expiryDate !== null && $batch->expiry_date->toDateString() !== $expiryDate) {
            $this->fail('expiry_date', "Batch {$batchNo} is recorded with expiry {$batch->expiry_date->toDateString()}.");
        }

        // Expired stock can still leave as a loss / transfer / adjustment (disposal),
        // but must never be dispensed.
        if ($type === TransactionType::Issue && $batch->expiry_date->lte($transactionDate)) {
            $this->fail('batch_no', "Batch {$batchNo} expired on {$batch->expiry_date->toDateString()} and cannot be issued; record it as a loss.");
        }

        return $batch;
    }

    /**
     * No future dates. And the Stock Card is written in date order with
     * running_balance as a snapshot at insert time, so an entry dated before
     * the product's latest entry would make the history inconsistent.
     * Same-day entries are fine.
     */
    private function assertDateAllowed(Facility $facility, Product $product, CarbonImmutable $date): void
    {
        $today = CarbonImmutable::today(config('app.business_timezone'))->toDateString();
        if ($date->toDateString() > $today) {
            $this->fail('transaction_date', 'transaction_date cannot be in the future.');
        }

        $latest = StockTransaction::query()
            ->where('facility_id', $facility->id)
            ->where('product_id', $product->id)
            ->max('transaction_date');

        if ($latest !== null && $date->toDateString() < substr($latest, 0, 10)) {
            $this->fail('transaction_date', 'The Stock Card for this product already has entries up to '.substr($latest, 0, 10).'; transaction_date cannot be earlier.');
        }
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
