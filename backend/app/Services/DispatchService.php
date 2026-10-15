<?php

namespace App\Services;

use App\Enums\DeliveryNoteStatus;
use App\Enums\StoreLevel;
use App\Enums\TransactionType;
use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\Product;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A store issuing stock down the chain to another facility in the system.
 *
 * The sender's side is immediate: one `issue` per line on its own Stock
 * Card. The receiver gets a draft delivery note (source_facility_id set) and
 * confirms it into receipts through DeliveryNoteService::confirm(), the same
 * as signing for a supplier's delivery — stock only lands in their balance
 * once someone there has checked it. Rejecting it puts the stock back on
 * the sender's card (DeliveryNoteService::reject()).
 */
class DispatchService
{
    public function __construct(private readonly StockLedgerService $ledger) {}

    /**
     * Where a store may dispatch to, one level down the chain: national →
     * state stores; state → LGA stores and SDPs in the state; LGA → SDPs in
     * the LGA. Anyone else is an external party — record a plain `issue`.
     *
     * @return Builder<Facility>
     */
    public function destinations(Facility $from): Builder
    {
        $query = Facility::query()->where('is_active', true)->whereKeyNot($from->id);

        return match ($from->store_level) {
            StoreLevel::National => $query->where('store_level', StoreLevel::State),
            StoreLevel::State => $query
                ->whereIn('lga_id', Lga::select('id')->where('state_id', $from->state_id))
                ->where(fn (Builder $q) => $q->whereNull('store_level')->orWhere('store_level', StoreLevel::Lga)),
            StoreLevel::Lga => $query->servicePoints()->where('lga_id', $from->lga_id),
            null => $query->whereRaw('1 = 0'),
        };
    }

    public function canDispatchTo(Facility $from, Facility $to): bool
    {
        return $this->destinations($from)->whereKey($to->id)->exists();
    }

    /**
     * Issue every line off the sender's card and create the receiver's draft
     * delivery note, all or nothing. 422 keyed items.N.field (or
     * dispatched_date) when a line breaks a ledger rule.
     *
     * @param  array{voucher_no?: string|null, dispatched_date: string, comments?: string|null, items: list<array{product_id: int, batch_no?: string|null, quantity: int}>}  $data
     */
    public function dispatch(Facility $from, Facility $to, array $data, User $user, ?string $clientReference = null): DeliveryNote
    {
        return DB::transaction(function () use ($from, $to, $data, $user, $clientReference) {
            // Same lock the ledger takes, so a replayed client_reference can't race the first request.
            Facility::whereKey($from->id)->lockForUpdate()->firstOrFail();

            if ($clientReference !== null) {
                $existing = DeliveryNote::query()
                    ->where('source_facility_id', $from->id)
                    ->where('client_reference', $clientReference)
                    ->first();
                if ($existing) {
                    return $existing;
                }
            }

            $date = CarbonImmutable::createFromFormat('!Y-m-d', $data['dispatched_date']);

            $note = DeliveryNote::create([
                'facility_id' => $to->id,
                'delivery_note_no' => $data['voucher_no'] ?? null,
                'source' => $from->name,
                'source_facility_id' => $from->id,
                'dispatched_date' => $date,
                // The receiver sets the real date when they confirm.
                'received_date' => $date,
                'capture_method' => 'manual',
                'comments' => $data['comments'] ?? null,
                'created_by' => $user->id,
                'client_reference' => $clientReference,
                'status' => DeliveryNoteStatus::Draft,
            ]);
            if ($note->delivery_note_no === null) {
                $note->update(['delivery_note_no' => sprintf('DSP-%06d', $note->id)]);
            }

            $products = Product::whereKey(array_column($data['items'], 'product_id'))->get()->keyBy('id');

            foreach (array_values($data['items']) as $i => $item) {
                $product = $products[$item['product_id']];
                try {
                    $issue = $this->ledger->record(
                        facility: $from,
                        product: $product,
                        type: TransactionType::Issue,
                        quantity: $item['quantity'],
                        transactionDate: $date,
                        performedBy: $user,
                        batchNo: $item['batch_no'] ?? null,
                        voucherNo: $note->delivery_note_no,
                        counterparty: $to->name,
                        comments: $data['comments'] ?? null,
                    );
                } catch (ValidationException $e) {
                    throw self::lineError($e, $i, $product, 'dispatched_date');
                }

                $note->items()->create([
                    'product_id' => $product->id,
                    'batch_no' => $issue->batch?->batch_no,
                    'expiry_date' => $issue->batch?->expiry_date,
                    'quantity' => $item['quantity'],
                    'source_transaction_id' => $issue->id,
                ]);
            }

            return $note;
        });
    }

    /** Re-key a ledger failure onto the delivery line that caused it. */
    public static function lineError(ValidationException $e, int $i, Product $product, string $dateField): ValidationException
    {
        $messages = [];
        foreach ($e->errors() as $field => $errors) {
            $key = $field === 'transaction_date' ? $dateField : "items.{$i}.{$field}";
            $messages[$key] = 'Line '.($i + 1)." ({$product->name}): ".$errors[0];
        }

        return ValidationException::withMessages($messages);
    }
}
