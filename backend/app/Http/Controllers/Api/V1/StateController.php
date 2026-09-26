<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\StateResource;
use App\Models\State;
use App\Support\HierarchyScope;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class StateController extends Controller
{
    /** States visible to the caller (all for federal/admin, own state for state officers, none below that). */
    public function index(HierarchyScope $scope): AnonymousResourceCollection
    {
        return StateResource::collection($scope->scopeStates(State::query())->orderBy('name')->get());
    }
}
