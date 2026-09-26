<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductStockResource;
use App\Models\Facility;
use App\Services\StockStatusService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class StockBalanceController extends Controller
{
    /**
     * Current stock at a facility: one entry per product with its batches,
     * straight from stock_balances, plus usable/expired split and flags.
     */
    public function index(Facility $facility, StockStatusService $status): AnonymousResourceCollection
    {
        Gate::authorize('view', $facility);

        return ProductStockResource::collection($status->forFacility($facility));
    }
}
