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
 * SDPs only: the stores' own Stock Cards are not part of the rollup.
 */
class RollupSummaryController extends Controller
{
    /** State rollup: how many facilities carry each flag, per-product totals, and the LGAs worst first. */
    public function state(State $state, HierarchyScope $scope, RollupService $rollups): JsonResponse
    {
        Gate::authorize('view', $state);

        $facilities = $scope->scopeFacilities(Facility::query()->servicePoints())
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
                    /** The state's own store (its Stock Card is not part of this rollup). */
                    'store' => $this->storeRef(Facility::storeForState($state)),
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
        $summary = $rollups->summarize($scope->scopeFacilities(Facility::query()->servicePoints()), $states, 'state_id');

        return response()->json([
            'data' => [
                'node' => [
                    'level' => 'country', 'id' => null, 'name' => 'Nigeria', 'parent' => null,
                    /** The national store (its Stock Card is not part of this rollup). */
                    'store' => $this->storeRef(Facility::nationalStore()),
                ],
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

    /** @return array{id: int, name: string} */
    private function storeRef(Facility $store): array
    {
        return ['id' => $store->id, 'name' => $store->name];
    }
}
