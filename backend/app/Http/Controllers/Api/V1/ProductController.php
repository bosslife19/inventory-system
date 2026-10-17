<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Support\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /** The product catalog. Not hierarchy-scoped: every role sees the same catalog. */
    public function index(Request $request): AnonymousResourceCollection
    {
        // Query strings carry booleans as "true"/"false", which Laravel's boolean rule rejects.
        if ($request->has('is_active')) {
            $request->merge(['is_active' => filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $request->query('is_active')]);
        }

        $filters = $request->validate([
            'category' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return ProductResource::collection(
            Product::query()
                ->when(isset($filters['category']), fn ($q) => $q->where('category', $filters['category']))
                ->when(isset($filters['is_active']), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
                ->orderBy('name')
                ->get()
        );
    }

    /** Add a product to the catalog. Any level may: the catalog is shared, and each facility then sets its own levels. */
    public function store(SaveProductRequest $request): ProductResource
    {
        $product = DB::transaction(function () use ($request) {
            $user = $request->user();
            $product = Product::create([...$request->validated(), 'is_active' => $request->boolean('is_active', true), 'created_by' => $user->id]);
            AuditLog::record('product.created', "Product {$product->sku} — {$product->name} added to the catalog", $product,
                place: AuditLog::placeOfUser($user),
                changes: AuditLog::snapshot($product, ['sku', 'name', 'category', 'unit_of_measure', 'pack_size', 'requires_batch_tracking', 'requires_cold_chain', 'min_stock_level', 'reorder_level', 'max_stock_level']));

            return $product;
        });

        return ProductResource::make($product);
    }

    /** Change a product, or retire it with is_active=false (admin, or whoever added it). Never deleted: the ledger references it. */
    public function update(SaveProductRequest $request, Product $product): ProductResource
    {
        DB::transaction(function () use ($request, $product) {
            $product->update($request->validated());
            if ($changes = AuditLog::diff($product)) {
                $verb = isset($changes['is_active']) ? ($product->is_active ? 'returned to use' : 'retired') : 'changed';
                AuditLog::record($verb === 'changed' ? 'product.updated' : ($product->is_active ? 'product.reactivated' : 'product.retired'),
                    "Product {$product->sku} — {$product->name} {$verb}", $product, changes: $changes);
            }
        });

        return ProductResource::make($product);
    }
}
