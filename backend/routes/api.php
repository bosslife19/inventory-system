<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\FacilityController;
use App\Http\Controllers\Api\V1\LgaController;
use App\Http\Controllers\Api\V1\LgaStockSummaryController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\StateController;
use App\Http\Controllers\Api\V1\StockActivityController;
use App\Http\Controllers\Api\V1\StockBalanceController;
use App\Http\Controllers\Api\V1\StockTransactionController;
use App\Http\Middleware\ScopeToHierarchy;
use Illuminate\Support\Facades\Route;

// Contract: docs/API_CONTRACT.md. Base URL /api/v1.

Route::prefix('v1')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

    Route::middleware(['auth:sanctum', ScopeToHierarchy::class])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);

        Route::get('states', [StateController::class, 'index']);
        Route::get('states/{state}/lgas', [LgaController::class, 'index']);
        Route::get('lgas/{lga}/facilities', [FacilityController::class, 'index']);
        Route::get('lgas/{lga}/stock-summary', [LgaStockSummaryController::class, 'show']);
        Route::get('lgas/{lga}/stock-activity', [StockActivityController::class, 'lga']);
        Route::get('facilities/{facility}/stock-activity', [StockActivityController::class, 'facility']);
        Route::get('facilities/{facility}', [FacilityController::class, 'show']);

        Route::get('products', [ProductController::class, 'index']);

        Route::get('facilities/{facility}/stock-balances', [StockBalanceController::class, 'index']);
        Route::get('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'index']);
        Route::post('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'store']);
    });
});
