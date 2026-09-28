<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Services\StockActivityService;
use App\Support\HierarchyScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class StockActivityController extends Controller
{
    /** Stock Card entries per week at one facility (received / issued / other). */
    public function facility(Request $request, Facility $facility, StockActivityService $activity): JsonResponse
    {
        Gate::authorize('view', $facility);

        return response()->json(['data' => $activity->weekly([$facility->id], $this->weeks($request))]);
    }

    /** Stock Card entries per week across the LGA's facilities the caller can see. */
    public function lga(Request $request, Lga $lga, HierarchyScope $scope, StockActivityService $activity): JsonResponse
    {
        Gate::authorize('view', $lga);

        $facilityIds = $scope->scopeFacilities($lga->facilities()->getQuery())->pluck('id')->all();

        return response()->json(['data' => $activity->weekly($facilityIds, $this->weeks($request))]);
    }

    /** Stock Card entries per week across the state's facilities the caller can see. */
    public function state(Request $request, State $state, HierarchyScope $scope, StockActivityService $activity): JsonResponse
    {
        Gate::authorize('view', $state);

        $facilityIds = $scope->scopeFacilities(Facility::query())
            ->whereIn('facilities.lga_id', Lga::select('id')->where('state_id', $state->id))
            ->select('facilities.id');

        return response()->json(['data' => $activity->weekly($facilityIds, $this->weeks($request))]);
    }

    /** Stock Card entries per week nationally. */
    public function federal(Request $request, HierarchyScope $scope, StockActivityService $activity): JsonResponse
    {
        Gate::authorize('viewNational', State::class);

        return response()->json([
            'data' => $activity->weekly($scope->scopeFacilities(Facility::query())->select('facilities.id'), $this->weeks($request)),
        ]);
    }

    private function weeks(Request $request): int
    {
        $validated = $request->validate([
            /** Number of weeks, ending with the current week. Default 12. */
            'weeks' => ['nullable', 'integer', 'min:4', 'max:52'],
        ]);

        return (int) ($validated['weeks'] ?? 12);
    }
}
