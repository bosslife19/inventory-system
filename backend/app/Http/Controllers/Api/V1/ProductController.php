<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\CatalogService;
use App\Support\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    /** The organization's product catalog. Not hierarchy-scoped: every role in it sees the same catalog. */
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

    /** Add a product to the catalog. Any level may: the organization's catalog is shared, and each facility then sets its own levels. */
    public function store(SaveProductRequest $request, CatalogService $catalog): ProductResource
    {
        return ProductResource::make($catalog->addProduct([...$request->validated(), 'is_active' => $request->boolean('is_active', true)], $request->user()));
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
