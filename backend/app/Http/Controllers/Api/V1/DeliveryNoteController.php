<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeliveryNoteStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDeliveryNoteRequest;
use App\Http\Resources\DeliveryNoteResource;
use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Services\DeliveryNoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class DeliveryNoteController extends Controller
{
    private const RELATIONS = ['items.product', 'creator', 'confirmer', 'rejecter'];

    /** A facility's delivery notes, newest first. */
    public function index(Request $request, Facility $facility): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', [DeliveryNote::class, $facility]);

        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(DeliveryNoteStatus::class)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $notes = DeliveryNote::query()
            ->where('facility_id', $facility->id)
            ->with(self::RELATIONS)
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('received_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 20);

        return DeliveryNoteResource::collection($notes);
    }

    public function show(DeliveryNote $deliveryNote): DeliveryNoteResource
    {
        Gate::authorize('view', $deliveryNote);

        return DeliveryNoteResource::make($deliveryNote->load(self::RELATIONS));
    }

    /**
     * Create a delivery note — a draft, or confirmed straight away with
     * confirm=true (the phone's reviewed scan). 201 when created; 200 with
     * the existing note when client_reference repeats one already sent.
     */
    public function store(StoreDeliveryNoteRequest $request, Facility $facility, DeliveryNoteService $service): JsonResponse
    {
        $note = $service->create(
            facility: $facility,
            data: $request->validated(),
            user: $request->user(),
            clientReference: $request->input('client_reference'),
            confirm: $request->boolean('confirm'),
        );

        return DeliveryNoteResource::make($note->load(self::RELATIONS))
            ->response()
            ->setStatusCode($note->wasRecentlyCreated ? 201 : 200);
    }

    /** Post a draft's items to the ledger as receipts. */
    public function confirm(Request $request, DeliveryNote $deliveryNote, DeliveryNoteService $service): DeliveryNoteResource
    {
        Gate::authorize('update', $deliveryNote);

        return DeliveryNoteResource::make($service->confirm($deliveryNote, $request->user())->load(self::RELATIONS));
    }

    public function reject(Request $request, DeliveryNote $deliveryNote, DeliveryNoteService $service): DeliveryNoteResource
    {
        Gate::authorize('update', $deliveryNote);

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        return DeliveryNoteResource::make($service->reject($deliveryNote, $request->user(), $validated['reason'] ?? null)->load(self::RELATIONS));
    }
}
