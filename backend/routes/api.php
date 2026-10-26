<?php

use App\Http\Controllers\Api\V1\AlertController;
use App\Http\Controllers\Api\V1\AuditEventController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BillingController;
use App\Http\Controllers\Api\V1\DeliveryNoteController;
use App\Http\Controllers\Api\V1\DeviceTokenController;
use App\Http\Controllers\Api\V1\DispatchController;
use App\Http\Controllers\Api\V1\FacilityController;
use App\Http\Controllers\Api\V1\ImportController;
use App\Http\Controllers\Api\V1\LgaController;
use App\Http\Controllers\Api\V1\LgaStockSummaryController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\Owner\OrganizationAdminController;
use App\Http\Controllers\Api\V1\Owner\OrganizationController;
use App\Http\Controllers\Api\V1\Owner\PlanTierController;
use App\Http\Controllers\Api\V1\Owner\PlatformController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProductLevelController;
use App\Http\Controllers\Api\V1\ReorderRequestController;
use App\Http\Controllers\Api\V1\ReorderSuggestionController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RollupSummaryController;
use App\Http\Controllers\Api\V1\StateController;
use App\Http\Controllers\Api\V1\StockActivityController;
use App\Http\Controllers\Api\V1\StockBalanceController;
use App\Http\Controllers\Api\V1\StockTransactionController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\Webhooks\PaystackWebhookController;
use App\Http\Middleware\EnsureAccountUsable;
use App\Http\Middleware\EnsureOrganizationMember;
use App\Http\Middleware\EnsureOwner;
use App\Http\Middleware\RequireFeature;
use App\Http\Middleware\ScopeToHierarchy;
use Illuminate\Support\Facades\Route;

// Contract: docs/API_CONTRACT.md. Base URL /api/v1.
// Paid-plan routes carry RequireFeature (402 feature_unavailable on the free plan).

Route::prefix('v1')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:6,1');
    Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:3,10');
    Route::get('platform', [PlatformController::class, 'show']);
    Route::get('platform/logo/{file}', [PlatformController::class, 'logo']);
    Route::get('organizations/{organization}/logo/{file}', [OrganizationController::class, 'logo']);
    Route::post('webhooks/paystack', PaystackWebhookController::class);

    // Every signed-in account, the platform owner included.
    Route::middleware(['auth:sanctum', EnsureAccountUsable::class])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/password', [AuthController::class, 'changePassword']);
    });

    // The platform owner's console.
    Route::middleware(['auth:sanctum', EnsureAccountUsable::class, EnsureOwner::class])->prefix('owner')->group(function () {
        Route::put('platform', [PlatformController::class, 'update']);
        Route::post('platform/logo', [PlatformController::class, 'uploadLogo']);
        Route::delete('platform/logo', [PlatformController::class, 'deleteLogo']);

        Route::get('plan-tiers', [PlanTierController::class, 'index']);
        Route::post('plan-tiers', [PlanTierController::class, 'store']);
        Route::put('plan-tiers/{planTier}', [PlanTierController::class, 'update']);

        Route::get('organizations', [OrganizationController::class, 'index']);
        Route::post('organizations', [OrganizationController::class, 'store']);
        Route::get('organizations/{organization}', [OrganizationController::class, 'show']);
        Route::get('organizations/{organization}/payments', [OrganizationController::class, 'payments']);
        Route::put('organizations/{organization}', [OrganizationController::class, 'update']);
        Route::post('organizations/{organization}/logo', [OrganizationController::class, 'uploadLogo']);
        Route::delete('organizations/{organization}/logo', [OrganizationController::class, 'deleteLogo']);

        Route::scopeBindings()->group(function () {
            Route::get('organizations/{organization}/admins', [OrganizationAdminController::class, 'index']);
            Route::post('organizations/{organization}/admins', [OrganizationAdminController::class, 'store']);
            Route::put('organizations/{organization}/admins/{user}', [OrganizationAdminController::class, 'update']);
            Route::post('organizations/{organization}/admins/{user}/reset-password', [OrganizationAdminController::class, 'resetPassword']);
        });
    });

    // An organization's own data: its members only, run as that organization (Tenant).
    Route::middleware(['auth:sanctum', EnsureAccountUsable::class, EnsureOrganizationMember::class, ScopeToHierarchy::class])->group(function () {
        Route::post('users/me/fcm-token', [DeviceTokenController::class, 'store']);

        // Paying for a plan tier through Paystack (admins; web only).
        Route::get('billing/plans', [BillingController::class, 'plans']);
        Route::get('billing/payments', [BillingController::class, 'payments']);
        Route::post('billing/checkout', [BillingController::class, 'checkout'])->middleware('throttle:10,1');
        Route::post('billing/payments/{reference}/verify', [BillingController::class, 'verify'])->middleware('throttle:30,1');

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
        Route::get('facilities/{facility}/product-levels', [ProductLevelController::class, 'index']);
        Route::put('facilities/{facility}/product-levels/{product}', [ProductLevelController::class, 'update']);
        Route::delete('facilities/{facility}/product-levels/{product}', [ProductLevelController::class, 'destroy']);
        Route::put('facilities/{facility}/product-amcs/{product}', [ProductLevelController::class, 'updateAmc']);
        Route::delete('facilities/{facility}/product-amcs/{product}', [ProductLevelController::class, 'destroyAmc']);

        Route::get('facilities/{facility}/stock-balances', [StockBalanceController::class, 'index']);
        Route::get('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'index']);
        Route::post('facilities/{facility}/stock-transactions', [StockTransactionController::class, 'store']);
        Route::get('facilities/{facility}/reorder-suggestions', [ReorderSuggestionController::class, 'index']);

        Route::get('facilities/{facility}/delivery-notes', [DeliveryNoteController::class, 'index']);
        Route::post('facilities/{facility}/delivery-notes', [DeliveryNoteController::class, 'store'])->middleware(RequireFeature::class.':delivery_scanning');
        Route::get('delivery-notes/{deliveryNote}', [DeliveryNoteController::class, 'show']);
        Route::post('delivery-notes/{deliveryNote}/confirm', [DeliveryNoteController::class, 'confirm']);
        Route::post('delivery-notes/{deliveryNote}/reject', [DeliveryNoteController::class, 'reject']);

        Route::get('facilities/{facility}/dispatches', [DispatchController::class, 'index']);
        Route::post('facilities/{facility}/dispatches', [DispatchController::class, 'store'])->middleware(RequireFeature::class.':supply_chain');
        Route::get('facilities/{facility}/dispatch-destinations', [DispatchController::class, 'destinations'])->middleware(RequireFeature::class.':supply_chain');

        Route::get('facilities/{facility}/reorder-requests', [ReorderRequestController::class, 'index']);
        Route::post('facilities/{facility}/reorder-requests', [ReorderRequestController::class, 'store'])->middleware(RequireFeature::class.':supply_chain');
        Route::get('facilities/{facility}/reorder-suppliers', [ReorderRequestController::class, 'suppliers'])->middleware(RequireFeature::class.':supply_chain');
        Route::get('reorder-requests/{reorderRequest}', [ReorderRequestController::class, 'show']);
        Route::post('reorder-requests/{reorderRequest}/fulfil', [ReorderRequestController::class, 'fulfil'])->middleware(RequireFeature::class.':supply_chain');
        Route::post('reorder-requests/{reorderRequest}/reject', [ReorderRequestController::class, 'reject']);
        Route::post('reorder-requests/{reorderRequest}/cancel', [ReorderRequestController::class, 'cancel']);

        Route::get('reports/{report}', [ReportController::class, 'show'])
            ->whereIn('report', ['stock-card', 'stock-status', 'reorder', 'expiry', 'stock-movement']);

        Route::get('audit-events', [AuditEventController::class, 'index']);

        Route::get('users', [UserController::class, 'index']);
        Route::post('users', [UserController::class, 'store']);
        Route::put('users/{user}', [UserController::class, 'update']);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);

        Route::get('imports/{kind}', [ImportController::class, 'columns'])
            ->whereIn('kind', ['products', 'facilities', 'users', 'product-levels', 'stock-entries']);
        Route::post('imports/{kind}', [ImportController::class, 'store'])
            ->whereIn('kind', ['products', 'facilities', 'users'])->middleware(RequireFeature::class.':bulk_imports');
        Route::post('facilities/{facility}/imports/{kind}', [ImportController::class, 'storeForFacility'])
            ->whereIn('kind', ['product-levels', 'stock-entries'])->middleware(RequireFeature::class.':bulk_imports');

        Route::get('alerts', [AlertController::class, 'index']);
        Route::post('alerts/{alert}/acknowledge', [AlertController::class, 'acknowledge']);
        Route::post('alerts/{alert}/resolve', [AlertController::class, 'resolve']);

        Route::get('notifications', [NotificationController::class, 'index']);
        Route::post('notifications/read-all', [NotificationController::class, 'readAll']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'read']);
    });
});
