<?php

namespace App\Services;

use App\Enums\ReorderRequestStatus;
use App\Enums\StoreLevel;
use App\Models\Facility;
use App\Models\ReorderRequest;
use App\Models\User;
use App\Support\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reorder requests (requisitions) up the chain: an SDP asks its LGA, state
 * or national store; an LGA store asks its state or the national store; a
 * state store asks the national store. The store asked is notified (push +
 * in-app) and fulfils the request by dispatching the stock — an issue on its
 * own Stock Card and a draft delivery note the requester confirms, exactly
 * like DispatchService — or rejects it. The requester hears either way.
 */
class ReorderRequestService
{
    public const TYPE = 'reorder_request';

    public function __construct(
        private readonly DispatchService $dispatches,
        private readonly UserNotifier $notifier,
    ) {}

    /**
     * The stores above a facility that it may ask, nearest first.
     *
     * @return Collection<int, Facility>
     */
    public function suppliers(Facility $facility): Collection
    {
        $facility->loadMissing('lga.state');
        $stores = match ($facility->store_level) {
            null => [$facility->lga ? Facility::storeForLga($facility->lga) : null, $facility->lga?->state ? Facility::storeForState($facility->lga->state) : null, Facility::nationalStore()],
            StoreLevel::Lga => [$facility->lga?->state ? Facility::storeForState($facility->lga->state) : null, Facility::nationalStore()],
            StoreLevel::State => [Facility::nationalStore()],
            StoreLevel::National => [],
        };

        return (new Collection(array_filter($stores, fn (?Facility $f) => $f?->is_active)))->values();
    }

    public function canAsk(Facility $from, Facility $supplier): bool
    {
        return $this->suppliers($from)->contains('id', $supplier->id);
    }

    /**
     * @param  array{supplier_facility_id: int, comments?: string|null, items: list<array{product_id: int, quantity: int}>}  $data
     */
    public function create(Facility $from, array $data, User $user, ?string $clientReference = null): ReorderRequest
    {
        $request = DB::transaction(function () use ($from, $data, $user, $clientReference) {
            if ($clientReference !== null
                && $existing = ReorderRequest::where(['facility_id' => $from->id, 'client_reference' => $clientReference])->first()) {
                return $existing;
            }

            $request = ReorderRequest::create([
                'facility_id' => $from->id,
                'supplier_facility_id' => $data['supplier_facility_id'],
                'status' => ReorderRequestStatus::Pending,
                'comments' => $data['comments'] ?? null,
                'requested_by' => $user->id,
                'client_reference' => $clientReference,
            ]);
            foreach ($data['items'] as $item) {
                $request->items()->create(['product_id' => $item['product_id'], 'quantity_requested' => $item['quantity']]);
            }
            $request->load('supplier');
            $lines = count($data['items']);
            AuditLog::record('reorder_request.created',
                "Reorder request {$request->number()} to {$request->supplier->name} ({$lines} product".($lines === 1 ? '' : 's').')',
                $request, $from, actor: $user);

            return $request;
        });

        if ($request->wasRecentlyCreated) {
            $request->load(['facility', 'supplier', 'items']);
            $count = $request->items->count();
            $this->tell($request->supplier, $request,
                "Reorder request from {$request->facility->name}",
                "{$request->number()}: {$count} product".($count === 1 ? '' : 's').' requested. Open it to issue the stock or decline.',
                'incoming');
        }

        return $request;
    }

    /**
     * Fulfil by dispatching to the requester — any store asked may send to
     * its requester, even several levels down. Lines may differ from what
     * was asked (what's in stock); quantity_supplied records what went.
     *
     * @param  array{dispatched_date: string, voucher_no?: string|null, comments?: string|null, items: list<array{product_id: int, batch_no?: string|null, quantity: int}>}  $data
     */
    public function fulfil(ReorderRequest $request, array $data, User $user): ReorderRequest
    {
        DB::transaction(function () use ($request, $data, $user) {
            $request = ReorderRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            $this->assertPending($request);

            $note = $this->dispatches->dispatch($request->supplier, $request->facility, [
                ...$data,
                'comments' => $data['comments'] ?? "For reorder request {$request->number()}",
            ], $user);

            $supplied = collect($data['items'])->groupBy('product_id')->map->sum('quantity');
            foreach ($request->items as $item) {
                $item->update(['quantity_supplied' => (int) ($supplied[$item->product_id] ?? 0)]);
            }
            $request->update([
                'status' => ReorderRequestStatus::Fulfilled,
                'responded_by' => $user->id,
                'responded_at' => CarbonImmutable::now(),
                'response_note' => $data['comments'] ?? null,
                'delivery_note_id' => $note->id,
            ]);
            AuditLog::record('reorder_request.fulfilled',
                "Reorder request {$request->number()} from {$request->facility->name} fulfilled with {$note->delivery_note_no}",
                $request, $request->supplier, actor: $user);
        });

        $request->refresh()->load(['facility', 'supplier', 'deliveryNote']);
        $this->tell($request->facility, $request,
            "Your order is on its way: {$request->supplier->name}",
            "{$request->number()} was issued as {$request->deliveryNote->delivery_note_no}. Confirm the delivery when it arrives.",
            'outgoing');

        return $request;
    }

    public function reject(ReorderRequest $request, ?string $reason, User $user): ReorderRequest
    {
        $this->respond($request, ReorderRequestStatus::Rejected, $reason, $user, 'reorder_request.rejected', 'declined');
        $this->tell($request->facility, $request,
            "Reorder request declined: {$request->supplier->name}",
            "{$request->number()} was declined".($reason ? ": {$reason}" : '.').' You can ask another store.',
            'outgoing');

        return $request;
    }

    public function cancel(ReorderRequest $request, User $user): ReorderRequest
    {
        $this->respond($request, ReorderRequestStatus::Cancelled, null, $user, 'reorder_request.cancelled', 'cancelled');

        return $request;
    }

    private function respond(ReorderRequest $request, ReorderRequestStatus $status, ?string $note, User $user, string $action, string $verb): void
    {
        DB::transaction(function () use ($request, $status, $note, $user, $action, $verb) {
            $locked = ReorderRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            $this->assertPending($locked);
            $request->update([
                'status' => $status,
                'responded_by' => $user->id,
                'responded_at' => CarbonImmutable::now(),
                'response_note' => $note,
            ]);
            $place = $status === ReorderRequestStatus::Cancelled ? $request->facility : $request->supplier;
            AuditLog::record($action, "Reorder request {$request->number()} from {$request->facility->name} {$verb}", $request, $place, actor: $user);
        });
    }

    private function assertPending(ReorderRequest $request): void
    {
        if ($request->status !== ReorderRequestStatus::Pending) {
            throw ValidationException::withMessages(['status' => "This request is already {$request->status->value}."]);
        }
    }

    private function tell(Facility $facility, ReorderRequest $request, string $title, string $body, string $direction): void
    {
        try {
            $this->notifier->send(AlertNotifier::keepersOf($facility)->get(['id', 'fcm_token']), self::TYPE, $title, $body, [
                'reorder_request_id' => (string) $request->id,
                'direction' => $direction,
                'facility_id' => (string) $facility->id,
                'url' => "stockcard://reorder-requests?focus={$request->id}",
            ]);
        } catch (\Throwable $e) {
            report($e); // the request itself stands
        }
    }
}
