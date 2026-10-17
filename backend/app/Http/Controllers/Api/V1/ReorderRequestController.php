<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ReorderRequestStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\FulfilReorderRequestRequest;
use App\Http\Requests\StoreReorderRequestRequest;
use App\Http\Resources\FacilityResource;
use App\Http\Resources\ReorderRequestCollection;
use App\Http\Resources\ReorderRequestResource;
use App\Models\Facility;
use App\Models\ReorderRequest;
use App\Services\ReorderRequestService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Reorder requests up the chain (ReorderRequestService): a facility asks a
 * store above it; the store fulfils it with a dispatch, or declines it.
 */
class ReorderRequestController extends Controller
{
    public const RELATIONS = ['facility', 'supplier', 'items.product', 'requester', 'responder', 'deliveryNote'];

    public function __construct(private readonly ReorderRequestService $requests) {}

    /**
     * A facility's requests: `incoming` = asked of this store, `outgoing` = made by this facility.
     * Pending first, then newest.
     */
    public function index(Request $request, Facility $facility): ReorderRequestCollection
    {
        Gate::authorize('view', $facility);

        $filters = $request->validate([
            'direction' => ['required', Rule::in(['incoming', 'outgoing'])],
            'status' => ['nullable', Rule::enum(ReorderRequestStatus::class)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $page = ReorderRequest::query()
            ->where($filters['direction'] === 'incoming' ? 'supplier_facility_id' : 'facility_id', $facility->id)
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->with(self::RELATIONS)
            ->orderByRaw('CASE WHEN status = ? THEN 0 ELSE 1 END', [ReorderRequestStatus::Pending->value])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 20);

        return new ReorderRequestCollection($page);
    }

    /** The stores above this facility it may ask, nearest first. */
    public function suppliers(Facility $facility): AnonymousResourceCollection
    {
        Gate::authorize('create', [ReorderRequest::class, $facility]);

        return FacilityResource::collection($this->requests->suppliers($facility)->load(['lga.state', 'state']));
    }

    /** Ask a store above for stock. 201; 200 with the existing request when client_reference repeats one. */
    public function store(StoreReorderRequestRequest $request, Facility $facility): ReorderRequestResource
    {
        $made = $this->requests->create($facility, $request->validated(), $request->user(), $request->input('client_reference'));

        return ReorderRequestResource::make($made->load(self::RELATIONS));
    }

    public function show(ReorderRequest $reorderRequest): ReorderRequestResource
    {
        Gate::authorize('view', $reorderRequest);

        return ReorderRequestResource::make($reorderRequest->load(self::RELATIONS));
    }

    /** Send the stock: a dispatch from the store asked to the requester. 422 if no longer pending. */
    public function fulfil(FulfilReorderRequestRequest $request, ReorderRequest $reorderRequest): ReorderRequestResource
    {
        return ReorderRequestResource::make($this->requests->fulfil($reorderRequest, $request->validated(), $request->user())->load(self::RELATIONS));
    }

    /** Decline it, optionally saying why. */
    public function reject(Request $request, ReorderRequest $reorderRequest): ReorderRequestResource
    {
        Gate::authorize('respond', $reorderRequest);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        return ReorderRequestResource::make($this->requests->reject($reorderRequest, $data['reason'] ?? null, $request->user())->load(self::RELATIONS));
    }

    /** Withdraw it (the requester), while still pending. */
    public function cancel(Request $request, ReorderRequest $reorderRequest): ReorderRequestResource
    {
        Gate::authorize('cancel', $reorderRequest);

        return ReorderRequestResource::make($this->requests->cancel($reorderRequest, $request->user())->load(self::RELATIONS));
    }
}
