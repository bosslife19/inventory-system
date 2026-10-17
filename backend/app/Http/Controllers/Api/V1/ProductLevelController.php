<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveProductLevelsRequest;
use App\Http\Resources\ProductLevelResource;
use App\Models\Facility;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use App\Services\AlertEngine;
use App\Services\StockStatusSnapshot;
use App\Support\AuditLog;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Each facility and store sets its own min / EOP / max per product, since
 * the right levels differ between an SDP, an LGA store, a state store and
 * the national store. Without its own, a facility uses the catalog's.
 */
class ProductLevelController extends Controller
{
    public function __construct(
        private readonly AlertEngine $alerts,
        private readonly StockStatusSnapshot $snapshot,
    ) {}

    /** Every active product, plus any retired one this facility set levels for, by name. */
    public function index(Facility $facility): AnonymousResourceCollection
    {
        Gate::authorize('view', $facility);

        $own = FacilityProductLevel::where('facility_id', $facility->id)->with('updater')->get()->keyBy('product_id');
        $products = Product::query()
            ->where(fn ($q) => $q->where('is_active', true)->orWhereIn('id', $own->keys()))
            ->orderBy('name')
            ->get();

        return ProductLevelResource::collection($products->map(fn (Product $p) => ['product' => $p, 'own' => $own[$p->id] ?? null]));
    }

    /** Set this facility's levels for a product. Its level, flags and alerts follow at once. */
    public function update(SaveProductLevelsRequest $request, Facility $facility, Product $product): ProductLevelResource
    {
        $own = DB::transaction(function () use ($request, $facility, $product) {
            $own = FacilityProductLevel::firstOrNew(['facility_id' => $facility->id, 'product_id' => $product->id]);
            $before = $own->exists ? $own : $product;
            $before = [$before->min_stock_level, $before->reorder_level, $before->max_stock_level];
            $own->fill([...$request->validated(), 'updated_by' => $request->user()->id])->save();

            $changes = [];
            foreach (['min_stock_level', 'reorder_level', 'max_stock_level'] as $i => $field) {
                if ($before[$i] !== $own->{$field}) {
                    $changes[$field] = [$before[$i], $own->{$field}];
                }
            }
            AuditLog::record('product.levels_set',
                "Stock levels for {$product->sku} at {$facility->name}: min {$own->min_stock_level}, EOP {$own->reorder_level}, max {$own->max_stock_level}",
                $product, $facility, changes: $changes);

            return $own;
        });

        $this->refreshDerived($facility, $product);

        return ProductLevelResource::make(['product' => $product, 'own' => $own->load('updater')]);
    }

    /** Go back to the catalog's levels for this product. */
    public function destroy(Facility $facility, Product $product): Response
    {
        Gate::authorize('setLevels', $facility);

        DB::transaction(function () use ($facility, $product) {
            $deleted = FacilityProductLevel::where(['facility_id' => $facility->id, 'product_id' => $product->id])->delete();
            if ($deleted) {
                AuditLog::record('product.levels_reset', "Stock levels for {$product->sku} at {$facility->name} back to the catalog’s", $product, $facility);
            }
        });

        $this->refreshDerived($facility, $product);

        return response()->noContent();
    }

    /** Thresholds moved, so the product's status and alerts may have too. Derived state: best effort, as after a ledger write. */
    private function refreshDerived(Facility $facility, Product $product): void
    {
        foreach ([
            fn () => $this->alerts->evaluate($facility, $product->id),
            fn () => $this->snapshot->refresh($facility, $product->id),
        ] as $derived) {
            try {
                $derived();
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
