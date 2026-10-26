<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\CheckoutRequest;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\PlanTierResource;
use App\Models\Payment;
use App\Models\PlanTier;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Paying for a plan tier through Paystack (web only), by the
 * organization's admins: the tiers on offer, a checkout, checking how it
 * went on the way back, and the organization's payment history.
 */
class BillingController extends Controller
{
    /** The tiers on offer, cheapest first. */
    public function plans(Request $request): AnonymousResourceCollection
    {
        $this->ensureAdmin($request);

        return PlanTierResource::collection(PlanTier::query()->offered()->get());
    }

    /** The organization's payments, newest first (the last 50). */
    public function payments(Request $request): AnonymousResourceCollection
    {
        $this->ensureAdmin($request);

        return PaymentResource::collection(
            Payment::query()->where('organization_id', $request->user()->organization_id)
                ->with(['tier', 'user'])->latest('id')->limit(50)->get()
        );
    }

    /**
     * Start paying for a tier: send the admin to authorization_url (Paystack's
     * checkout). They come back to the web app's /billing page with
     * ?reference=…, which then verifies the payment.
     */
    public function checkout(CheckoutRequest $request, BillingService $billing): JsonResponse
    {
        [$payment, $url] = $billing->checkout($request->user(), PlanTier::findOrFail($request->validated('plan_tier_id')), $request->integer('months'));

        return response()->json([
            'data' => PaymentResource::make($payment->load(['tier', 'user'])),
            /**
             * Paystack's checkout page.
             *
             * @var string
             */
            'authorization_url' => $url,
        ], 201);
    }

    /** Ask Paystack how a payment went and, if it succeeded, apply it (once). A finished payment is returned as it is. */
    public function verify(Request $request, string $reference, BillingService $billing): PaymentResource
    {
        $this->ensureAdmin($request);
        $payment = Payment::query()->where('organization_id', $request->user()->organization_id)
            ->where('reference', $reference)->firstOrFail();

        return PaymentResource::make($billing->verify($payment)->load(['tier', 'user']));
    }

    private function ensureAdmin(Request $request): void
    {
        abort_unless($request->user()->role === UserRole::Admin, 403, 'Only your organization’s admins see its billing.');
    }
}
