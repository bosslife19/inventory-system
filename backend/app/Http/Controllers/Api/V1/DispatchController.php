<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeliveryNoteStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDispatchRequest;
use App\Http\Resources\DeliveryNoteCollection;
use App\Http\Resources\DeliveryNoteResource;
use App\Http\Resources\FacilityResource;
use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Services\DispatchService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * A store issuing stock down the chain. Each dispatch is an issue on the
 * store's own Stock Card plus a draft delivery note at the receiver, who
 * confirms (or rejects) it like any other delivery.
 */
class DispatchController extends Controller
{
    /** What this store has dispatched, newest first. Status is the receiver's: draft = not yet received. */
    public function index(Request $request, Facility $facility): DeliveryNoteCollection
    {
        Gate::authorize('view', $facility);

        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(DeliveryNoteStatus::class)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $notes = DeliveryNote::query()
            ->where('source_facility_id', $facility->id)
            ->with(DeliveryNoteController::RELATIONS)
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('dispatched_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 20);

        return new DeliveryNoteCollection($notes);
    }

    /** Facilities this store may dispatch to: one level down the chain, active, by name. */
    public function destinations(Facility $facility, DispatchService $dispatches): AnonymousResourceCollection
    {
        Gate::authorize('dispatch', [DeliveryNote::class, $facility]);

        return FacilityResource::collection(
            $dispatches->destinations($facility)->with(['lga.state', 'state'])->orderBy('name')->get()
        );
    }

    /**
     * Issue stock to a facility below this store. 201 with the receiver's
     * draft delivery note; 200 with the existing one when client_reference
     * repeats a dispatch already made.
     */
    public function store(StoreDispatchRequest $request, Facility $facility, DispatchService $dispatches): DeliveryNoteResource
    {
        $note = $dispatches->dispatch(
            from: $facility,
            to: $request->destination(),
            data: $request->validated(),
            user: $request->user(),
            clientReference: $request->input('client_reference'),
        );

        // A just-created model makes Laravel answer 201; a replayed one 200.
        return DeliveryNoteResource::make($note->load(DeliveryNoteController::RELATIONS));
    }
}
