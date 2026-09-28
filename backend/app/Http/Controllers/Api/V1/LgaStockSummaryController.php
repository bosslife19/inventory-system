<?php

namespace App\Http\Controllers\Api\V1;

use App\Data\FacilityStatusCounts;
use App\Data\FacilityStockSummary;
use App\Http\Controllers\Controller;
use App\Http\Resources\FacilityStockSummaryResource;
use App\Http\Resources\ProductRollupResource;
use App\Models\Lga;
use App\Services\RollupService;
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
     * Computed live from stock_balances — fine at LGA scale, and it carries
     * per-product batch detail. State/Federal aggregate facility_product_status.
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
                /** Same as child_count here; the facility total at State and Federal level. */
                'facility_count' => $facilities->count(),
                /** Number of child facilities with at least one product carrying each flag. */
                'facility_counts' => $rollup['facility_counts']->toArray(),
                /** Facilities by their most serious issue, each counted once. */
                'facility_status' => $this->facilityStatus($rollup['facilities'])->toArray(),
                'products' => ProductRollupResource::collection($rollup['products']),
                /** Child facilities, worst first. */
                'children' => FacilityStockSummaryResource::collection($rollup['facilities']),
            ],
        ]);
    }

    /**
     * @param  list<FacilityStockSummary>  $facilities
     */
    private function facilityStatus(array $facilities): FacilityStatusCounts
    {
        $status = new FacilityStatusCounts;
        foreach ($facilities as $f) {
            $status->add(RollupService::facilityStatus((object) [
                'product_count' => count($f->products),
                'stock_out' => $f->flagCounts->stockOut,
                'low_stock' => $f->flagCounts->lowStock,
                'expired' => $f->flagCounts->expired,
                'needs_reorder' => count(array_filter($f->products, fn ($p) => $p->needsReorder())),
            ]));
        }

        return $status;
    }
}
