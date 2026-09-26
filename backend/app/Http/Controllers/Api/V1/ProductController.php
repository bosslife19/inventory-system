<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

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
}
