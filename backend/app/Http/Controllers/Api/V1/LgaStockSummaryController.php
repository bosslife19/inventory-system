<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FacilityStockSummaryResource;
use App\Http\Resources\ProductRollupResource;
use App\Models\Lga;
use App\Services\StockStatusService;
use App\Support\HierarchyScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class LgaStockSummaryController extends Controller
{
    /**
     * LGA rollup: totals per product, how many facilities carry each flag,
     * and the facility drill-down list sorted worst-first.
     *
     * Computed live from stock_balances — fine at LGA scale. Phase 3 moves
     * State/Federal (and optionally this) onto lga_stock_summary.
     */
    public function show(Lga $lga, HierarchyScope $scope, StockStatusService $status): JsonResponse
    {
        Gate::authorize('view', $lga);

        $lga->loadMissing('state');
        $facilities = $scope->scopeFacilities($lga->facilities()->getQuery())->get();
        $rollup = $status->rollup($status->forFacilities($facilities));

        return response()->json([
            'data' => [
                'node' => [
                    'level' => 'lga',
                    'id' => $lga->id,
                    'name' => $lga->name,
                    'parent' => ['level' => 'state', 'id' => $lga->state->id, 'name' => $lga->state->name],
                ],
                'child_count' => $facilities->count(),
                /** Number of child facilities with at least one product carrying each flag. */
                'facility_counts' => $rollup['facility_counts']->toArray(),
                'products' => ProductRollupResource::collection($rollup['products']),
                /** Child facilities, worst first. */
                'children' => FacilityStockSummaryResource::collection($rollup['facilities']),
            ],
        ]);
    }
}
