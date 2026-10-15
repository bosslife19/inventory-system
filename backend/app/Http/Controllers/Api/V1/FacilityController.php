<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveFacilityRequest;
use App\Http\Resources\FacilityResource;
use App\Models\Facility;
use App\Models\Lga;
use App\Support\HierarchyScope;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
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
    public function store(SaveFacilityRequest $request): FacilityResource
    {
        return FacilityResource::make(Facility::create([...$request->validated(), 'is_active' => $request->boolean('is_active', true)]));
    }

    /** Change a facility's details, or close it with is_active=false (admin). Never deleted. */
    public function update(SaveFacilityRequest $request, Facility $facility): FacilityResource
    {
        $facility->update($request->validated());

        return FacilityResource::make($facility);
    }
}
