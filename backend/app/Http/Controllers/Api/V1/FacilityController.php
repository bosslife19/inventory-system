<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveFacilityRequest;
use App\Http\Resources\FacilityResource;
use App\Models\Facility;
use App\Models\Lga;
use App\Services\CatalogService;
use App\Support\AuditLog;
use App\Support\HierarchyScope;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class FacilityController extends Controller
{
    /** SDPs in an LGA (the LGA's store is not listed). */
    public function index(Lga $lga, HierarchyScope $scope): AnonymousResourceCollection
    {
        Gate::authorize('view', $lga);

        return FacilityResource::collection(
            $scope->scopeFacilities($lga->facilities()->servicePoints()->getQuery())->with('lga.state')->orderBy('name')->get()
        );
    }

    public function show(Facility $facility): FacilityResource
    {
        Gate::authorize('view', $facility);

        return FacilityResource::make($facility);
    }

    /** Add a facility (SDP) to an LGA (admin). */
    public function store(SaveFacilityRequest $request, CatalogService $catalog): FacilityResource
    {
        return FacilityResource::make($catalog->addFacility([...$request->validated(), 'is_active' => $request->boolean('is_active', true)]));
    }

    /** Change a facility's details, or close it with is_active=false (admin). Never deleted. */
    public function update(SaveFacilityRequest $request, Facility $facility): FacilityResource
    {
        DB::transaction(function () use ($request, $facility) {
            $facility->update($request->validated());
            if ($changes = AuditLog::diff($facility)) {
                $action = isset($changes['is_active']) ? ($facility->is_active ? 'facility.reopened' : 'facility.closed') : 'facility.updated';
                $verb = ['facility.reopened' => 'reopened', 'facility.closed' => 'closed', 'facility.updated' => 'details changed'][$action];
                AuditLog::record($action, "Facility {$facility->name} {$verb}", $facility, $facility, $changes);
            }
        });

        return FacilityResource::make($facility);
    }
}
