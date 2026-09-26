<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FacilityResource;
use App\Models\Facility;
use App\Models\Lga;
use App\Support\HierarchyScope;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class FacilityController extends Controller
{
    /** Facilities in an LGA. */
    public function index(Lga $lga, HierarchyScope $scope): AnonymousResourceCollection
    {
        Gate::authorize('view', $lga);

        return FacilityResource::collection(
            $scope->scopeFacilities($lga->facilities()->getQuery())->with('lga.state')->orderBy('name')->get()
        );
    }

    public function show(Facility $facility): FacilityResource
    {
        Gate::authorize('view', $facility);

        return FacilityResource::make($facility);
    }
}
