<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AreaStockSummaryResource;
use App\Http\Resources\ProductRollupResource;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Services\RollupService;
use App\Support\HierarchyScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * State and Federal rollups: the LGA summary's shape one level up, with
 * LGAs / States as children. Aggregated from facility_product_status.
 */
class RollupSummaryController extends Controller
{
    /** State rollup: how many facilities carry each flag, per-product totals, and the LGAs worst first. */
    public function state(State $state, HierarchyScope $scope, RollupService $rollups): JsonResponse
    {
        Gate::authorize('view', $state);

        $facilities = $scope->scopeFacilities(Facility::query())
            ->whereIn('facilities.lga_id', Lga::select('id')->where('state_id', $state->id));
        $lgas = $scope->scopeLgas($state->lgas()->getQuery())->orderBy('name')->get();
        $summary = $rollups->summarize($facilities, $lgas, 'lga_id');

        return response()->json([
            'data' => [
                'node' => [
                    'level' => 'state',
                    'id' => $state->id,
                    'name' => $state->name,
                    'parent' => ['level' => 'country', 'id' => null, 'name' => 'Nigeria'],
                ],
                /** @var int */
                'child_count' => $lgas->count(),
                'facility_count' => $summary['facility_count'],
                /** Number of facilities with at least one product carrying each flag. */
                'facility_counts' => $summary['facility_counts'],
                /** Facilities by their most serious issue, each counted once. */
                'facility_status' => $summary['facility_status']->toArray(),
                'products' => ProductRollupResource::collection($summary['products']),
                /** Child LGAs, worst first. */
                'children' => AreaStockSummaryResource::collection($summary['children']),
            ],
        ]);
    }

    /** National rollup: every state, worst first. */
    public function federal(HierarchyScope $scope, RollupService $rollups): JsonResponse
    {
        Gate::authorize('viewNational', State::class);

        $states = $scope->scopeStates(State::query())->orderBy('name')->get();
        $summary = $rollups->summarize($scope->scopeFacilities(Facility::query()), $states, 'state_id');

        return response()->json([
            'data' => [
                'node' => ['level' => 'country', 'id' => null, 'name' => 'Nigeria', 'parent' => null],
                /** @var int */
                'child_count' => $states->count(),
                'facility_count' => $summary['facility_count'],
                /** Number of facilities with at least one product carrying each flag. */
                'facility_counts' => $summary['facility_counts'],
                /** Facilities by their most serious issue, each counted once. */
                'facility_status' => $summary['facility_status']->toArray(),
                'products' => ProductRollupResource::collection($summary['products']),
                /** Child states, worst first. */
                'children' => AreaStockSummaryResource::collection($summary['children']),
            ],
        ]);
    }
}
