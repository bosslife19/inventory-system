<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveEnteredAmcRequest;
use App\Http\Requests\SaveProductLevelsRequest;
use App\Http\Resources\ProductLevelResource;
use App\Models\Facility;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use App\Services\ProductLevelService;
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
    public function __construct(private readonly ProductLevelService $levels) {}

    /** Every active product, plus any retired one this facility set levels or an AMC for, by name. */
    public function index(Facility $facility): AnonymousResourceCollection
    {
        Gate::authorize('view', $facility);

        $own = FacilityProductLevel::where('facility_id', $facility->id)->with('updater')->get()->keyBy('product_id');
        $amcs = FacilityProductAmc::where('facility_id', $facility->id)->get()->keyBy('product_id');
        $products = Product::query()
            ->where(fn ($q) => $q->where('is_active', true)->orWhereIn('id', $own->keys())->orWhereIn('id', $amcs->keys()))
            ->orderBy('name')
            ->get();

        return ProductLevelResource::collection($products->map(fn (Product $p) => ['product' => $p, 'own' => $own[$p->id] ?? null, 'amc' => $amcs[$p->id] ?? null]));
    }

    /**
     * Enter an AMC for a product, for a facility or store without enough
     * history of its own (e.g. newly onboarded). Reorder suggestions use it
     * until the facility has a full AMC window of records.
     */
    public function updateAmc(SaveEnteredAmcRequest $request, Facility $facility, Product $product): ProductLevelResource
    {
        $amc = $this->levels->setAmc($facility, $product, (float) $request->validated('amc_quantity'), $request->user());

        return $this->levelsRow($facility, $product, $amc);
    }

    /** Drop the entered AMC; reorder suggestions go back to the computed one. */
    public function destroyAmc(Facility $facility, Product $product): Response
    {
        Gate::authorize('setLevels', $facility);

        DB::transaction(function () use ($facility, $product) {
            if (FacilityProductAmc::where(['facility_id' => $facility->id, 'product_id' => $product->id])->delete()) {
                AuditLog::record('product.amc_cleared', "Entered AMC for {$product->sku} at {$facility->name} cleared", $product, $facility);
            }
        });

        return response()->noContent();
    }

    private function levelsRow(Facility $facility, Product $product, ?FacilityProductAmc $amc = null): ProductLevelResource
    {
        return ProductLevelResource::make([
            'product' => $product,
            'own' => FacilityProductLevel::where(['facility_id' => $facility->id, 'product_id' => $product->id])->with('updater')->first(),
            'amc' => $amc ?? FacilityProductAmc::where(['facility_id' => $facility->id, 'product_id' => $product->id])->first(),
        ]);
    }

    /** Set this facility's levels for a product. Its level, flags and alerts follow at once. */
    public function update(SaveProductLevelsRequest $request, Facility $facility, Product $product): ProductLevelResource
    {
        $this->levels->setLevels($facility, $product, $request->validated(), $request->user());

        return $this->levelsRow($facility, $product);
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

        $this->levels->refreshDerived($facility, $product->id);

        return response()->noContent();
    }
}
