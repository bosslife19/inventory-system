<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LgaResource;
use App\Models\State;
use App\Support\HierarchyScope;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class LgaController extends Controller
{
    /** LGAs in a state. */
    public function index(State $state, HierarchyScope $scope): AnonymousResourceCollection
    {
        Gate::authorize('view', $state);

        return LgaResource::collection(
            $scope->scopeLgas($state->lgas()->getQuery())->orderBy('name')->get()
        );
    }
}
