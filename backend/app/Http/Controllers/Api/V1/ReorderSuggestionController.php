<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReorderSuggestionResource;
use App\Models\Facility;
use App\Services\ReorderService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class ReorderSuggestionController extends Controller
{
    /**
     * Quantity to order per product stocked at the facility: latest AMC
     * snapshot against current usable stock. Products needing an order
     * come first, lowest months of stock first.
     */
    public function index(Facility $facility, ReorderService $reorder): AnonymousResourceCollection
    {
        Gate::authorize('view', $facility);

        return ReorderSuggestionResource::collection($reorder->suggestions($facility));
    }
}
