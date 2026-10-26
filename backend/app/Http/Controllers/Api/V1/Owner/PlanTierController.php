<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Http\Controllers\Controller;
use App\Http\Requests\SavePlanTierRequest;
use App\Http\Resources\PlanTierResource;
use App\Models\PlanTier;
use App\Support\AuditLog;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** The paid plan tiers organizations can buy: price and limits, set by the platform owner. Withdrawn, never deleted. */
class PlanTierController extends Controller
{
    /** Every tier, withdrawn ones included, in the order they're offered. */
    public function index(): AnonymousResourceCollection
    {
        return PlanTierResource::collection(PlanTier::query()->orderBy('sort_order')->orderBy('monthly_price')->get());
    }

    public function store(SavePlanTierRequest $request): PlanTierResource
    {
        $tier = PlanTier::create($request->validated());
        AuditLog::record('plan_tier.created', "Plan {$tier->name} added at ₦".number_format($tier->monthly_price).' a month', $tier);

        return PlanTierResource::make($tier);
    }

    /** Change a tier; a new price applies to checkouts from now on. is_active=false withdraws it from sale. */
    public function update(SavePlanTierRequest $request, PlanTier $planTier): PlanTierResource
    {
        $planTier->update($request->validated());
        if ($changes = AuditLog::diff($planTier)) {
            AuditLog::record('plan_tier.updated', "Plan {$planTier->name} changed", $planTier, changes: $changes);
        }

        return PlanTierResource::make($planTier);
    }
}
