<?php

namespace App\Services;

use App\Enums\DeliveryNoteStatus;
use App\Enums\TransactionType;
use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Models\Product;
use App\Models\User;
use App\Support\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Delivery notes: drafts, confirmation into the ledger, rejection.
 *
 * Confirmation is the only way a delivery note becomes stock (backend
 * CLAUDE.md rule 4): each item is posted as a receipt through
 * StockLedgerService, so every ledger rule (batch/expiry consistency, no
 * back-dating) applies. All items post or none do — a delivery is signed
 * for as a whole.
 */
class DeliveryNoteService
{
    public function __construct(private readonly StockLedgerService $ledger) {}

    /**
     * @param  array{delivery_note_no?: string|null, source: string, received_date: string, capture_method?: string|null, comments?: string|null, items: list<array{product_id: int, batch_no?: string|null, expiry_date?: string|null, quantity: int}>}  $data
     */
    public function create(Facility $facility, array $data, User $user, ?string $clientReference = null, bool $confirm = false): DeliveryNote
    {
        return DB::transaction(function () use ($facility, $data, $user, $clientReference, $confirm) {
            Facility::whereKey($facility->id)->lockForUpdate()->firstOrFail();

            if ($clientReference !== null) {
                $existing = DeliveryNote::where('facility_id', $facility->id)->where('client_reference', $clientReference)->first();
                if ($existing) {
                    return $existing;
                }
            }

            $note = DeliveryNote::create([
                'facility_id' => $facility->id,
                'delivery_note_no' => $data['delivery_note_no'] ?? null,
                'source' => $data['source'],
                'received_date' => $data['received_date'],
                'capture_method' => $data['capture_method'] ?? 'manual',
                'comments' => $data['comments'] ?? null,
                'created_by' => $user->id,
                'client_reference' => $clientReference,
                'status' => DeliveryNoteStatus::Draft,
            ]);

            foreach ($data['items'] as $item) {
                $note->items()->create([
                    'product_id' => $item['product_id'],
                    'batch_no' => $item['batch_no'] ?? null,
                    'expiry_date' => $item['expiry_date'] ?? null,
                    'quantity' => $item['quantity'],
                ]);
            }

            $lines = count($data['items']);
            AuditLog::record(
                'delivery_note.created',
                "Delivery note {$note->delivery_note_no} from {$note->source} entered ({$lines} line".($lines === 1 ? '' : 's').', '.($note->capture_method === 'ocr' ? 'scanned' : 'typed').')',
                $note, $facility, actor: $user,
            );

            return $confirm ? $this->confirm($note, $user) : $note;
        });
    }

    /**
     * Post every item as a receipt. 422 (keyed items.N.field) if any line
     * breaks a ledger rule. $receivedDate (Y-m-d) replaces the note's date —
     * how the receiver of a dispatch records when it actually arrived; it
     * can't be before the dispatch.
     */
    public function confirm(DeliveryNote $note, User $user, ?string $receivedDate = null): DeliveryNote
    {
        if ($note->status !== DeliveryNoteStatus::Draft) {
            throw ValidationException::withMessages(['status' => "This delivery note is already {$note->status->value}."]);
        }

        if ($receivedDate !== null && $note->dispatched_date && $receivedDate < $note->dispatched_date->toDateString()) {
            throw ValidationException::withMessages(['received_date' => "It was dispatched on {$note->dispatched_date->toDateString()}; it can't have arrived earlier."]);
        }

        return DB::transaction(function () use ($note, $user, $receivedDate) {
            if ($receivedDate !== null) {
                $note->update(['received_date' => $receivedDate]);
            }
            $facility = $note->facility;
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $note->received_date->toDateString());

            foreach ($note->items()->with('product')->get()->values() as $i => $item) {
                try {
                    $transaction = $this->ledger->record(
                        facility: $facility,
                        product: $item->product,
                        type: TransactionType::Receipt,
                        quantity: $item->quantity,
                        transactionDate: $date,
                        performedBy: $user,
                        batchNo: $item->batch_no,
                        expiryDate: $item->expiry_date?->toDateString(),
                        voucherNo: $note->delivery_note_no,
                        counterparty: $note->source,
                        deliveryNoteId: $note->id,
                    );
                } catch (ValidationException $e) {
                    // Point the client at the line that failed.
                    throw DispatchService::lineError($e, $i, $item->product, 'received_date');
                }
                $item->update(['stock_transaction_id' => $transaction->id]);
            }

            $note->update([
                'status' => DeliveryNoteStatus::Confirmed,
                'confirmed_by' => $user->id,
                'confirmed_at' => CarbonImmutable::now(),
            ]);

            AuditLog::record(
                'delivery_note.confirmed',
                "Delivery {$note->delivery_note_no} from {$note->source} confirmed as received on {$note->received_date->toDateString()}",
                $note, $facility, actor: $user,
            );

            return $note;
        });
    }

    /**
     * Refuse a draft. A dispatch from another store has already left the
     * sender's card, so each line goes back onto it as a receipt from the
     * receiver ("returned") — the ledger stays append-only and balanced.
     */
    public function reject(DeliveryNote $note, User $user, ?string $reason): DeliveryNote
    {
        if ($note->status !== DeliveryNoteStatus::Draft) {
            throw ValidationException::withMessages(['status' => "This delivery note is already {$note->status->value}."]);
        }

        return DB::transaction(function () use ($note, $user, $reason) {
            if ($sender = $note->sourceFacility) {
                $today = CarbonImmutable::today(config('app.business_timezone'));
                foreach ($note->items()->with('product')->get()->values() as $i => $item) {
                    if ($item->source_transaction_id === null) {
                        continue;
                    }
                    try {
                        $return = $this->ledger->record(
                            facility: $sender,
                            product: $item->product,
                            type: TransactionType::Receipt,
                            quantity: $item->quantity,
                            transactionDate: $today,
                            performedBy: $user,
                            batchNo: $item->batch_no,
                            voucherNo: $note->delivery_note_no,
                            counterparty: "{$note->facility->name} (returned)",
                            comments: 'Delivery rejected by the receiver'.($reason ? ": {$reason}" : '.'),
                        );
                    } catch (ValidationException $e) {
                        throw DispatchService::lineError($e, $i, $item->product, 'status');
                    }
                    $item->update(['return_transaction_id' => $return->id]);
                }
            }

            $note->update([
                'status' => DeliveryNoteStatus::Rejected,
                'rejected_by' => $user->id,
                'rejected_at' => CarbonImmutable::now(),
                'rejection_reason' => $reason,
            ]);

            AuditLog::record(
                'delivery_note.rejected',
                "Delivery {$note->delivery_note_no} from {$note->source} rejected".($reason ? ": {$reason}" : '').($sender ? " — stock returned to {$sender->name}" : ''),
                $note, $note->facility, actor: $user,
            );

            return $note;
        });
    }

    /** Batch rules at the shape level, like StoreStockTransactionRequest (backend CLAUDE.md rule 2). */
    public static function itemBatchErrors(Product $product, ?string $batchNo, ?string $expiryDate): ?string
    {
        if ($product->requires_batch_tracking && $batchNo === null) {
            return "batch_no is required for {$product->name}.";
        }
        if (! $product->requires_batch_tracking && ($batchNo !== null || $expiryDate !== null)) {
            return "{$product->name} is not batch-tracked; omit batch_no and expiry_date.";
        }

        return null;
    }
}
