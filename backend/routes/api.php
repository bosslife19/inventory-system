<?php

use App\Http\Controllers\Api\V1\AlertController;
use App\Http\Controllers\Api\V1\AuditEventController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DeliveryNoteController;
use App\Http\Controllers\Api\V1\DeviceTokenController;
use App\Http\Controllers\Api\V1\DispatchController;
use App\Http\Controllers\Api\V1\FacilityController;
use App\Http\Controllers\Api\V1\LgaController;
use App\Http\Controllers\Api\V1\LgaStockSummaryController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ReorderSuggestionController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RollupSummaryController;
use App\Http\Controllers\Api\V1\StateController;
use App\Http\Controllers\Api\V1\StockActivityController;
use App\Http\Controllers\Api\V1\StockBalanceController;
use App\Http\Controllers\Api\V1\StockTransactionController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Middleware\EnsureAccountUsable;
use App\Http\Middleware\ScopeToHierarchy;
use Illuminate\Support\Facades\Route;

// Contract: docs/API_CONTRACT.md. Base URL /api/v1.

Route::prefix('v1')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

    Route::middleware(['auth:sanctum', EnsureAccountUsable::class, ScopeToHierarchy::class])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/password', [AuthController::class, 'changePassword']);
        Route::post('users/me/fcm-token', [DeviceTokenController::class, 'store']);

        Route::get('states', [StateController::class, 'index']);
        Route::get('states/{state}/lgas', [LgaController::class, 'index']);
        Route::get('lgas/{lga}/facilities', [FacilityController::class, 'index']);
        Route::get('lgas/{lga}/stock-summary', [LgaStockSummaryController::class, 'show']);
        Route::get('lgas/{lga}/stock-activity', [StockActivityController::class, 'lga']);
        Route::get('states/{state}/stock-summary', [RollupSummaryController::class, 'state']);
        Route::get('states/{state}/stock-activity', [StockActivityController::class, 'state']);
        Route::get('federal/stock-summary', [RollupSummaryController::class, 'federal']);
        Route::get('federal/stock-activity', [StockActivityController::class, 'federal']);
        Route::get('facilities/{facility}/stock-activity', [StockActivityController::class, 'facility']);
        Route::get('facilities/{facility}', [FacilityController::class, 'show']);
        Route::post('facilities', [FacilityController::class, 'store']);
        Route::put('facilities/{facility}', [FacilityController::class, 'update']);

        Route::get('products', [ProductController::class, 'index']);
        Route::post('products', [ProductController::class, 'store']);
        Route::put('products/{product}', [ProductController::class, 'update']);

        Route::get('facilities/{facility}/stock-balances', [StockBalanceController::class, 'index']);
        Route::get('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'index']);
        Route::post('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'store']);
        Route::get('facilities/{facility}/reorder-suggestions', [ReorderSuggestionController::class, 'index']);

        Route::get('facilities/{facility}/delivery-notes', [DeliveryNoteController::class, 'index']);
        Route::post('facilities/{facility}/delivery-notes', [DeliveryNoteController::class, 'store']);
        Route::get('delivery-notes/{deliveryNote}', [DeliveryNoteController::class, 'show']);
        Route::post('delivery-notes/{deliveryNote}/confirm', [DeliveryNoteController::class, 'confirm']);
        Route::post('delivery-notes/{deliveryNote}/reject', [DeliveryNoteController::class, 'reject']);

        Route::get('facilities/{facility}/dispatches', [DispatchController::class, 'index']);
        Route::post('facilities/{facility}/dispatches', [DispatchController::class, 'store']);
        Route::get('facilities/{facility}/dispatch-destinations', [DispatchController::class, 'destinations']);

        Route::get('reports/{report}', [ReportController::class, 'show'])
            ->whereIn('report', ['stock-card', 'stock-status', 'reorder', 'expiry']);

        Route::get('audit-events', [AuditEventController::class, 'index']);

        Route::get('users', [UserController::class, 'index']);
        Route::post('users', [UserController::class, 'store']);
        Route::put('users/{user}', [UserController::class, 'update']);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);

        Route::get('alerts', [AlertController::class, 'index']);
        Route::post('alerts/{alert}/acknowledge', [AlertController::class, 'acknowledge']);
        Route::post('alerts/{alert}/resolve', [AlertController::class, 'resolve']);
    });
});
