<?php

namespace App\Services;

use App\Enums\Plan;
use App\Models\Organization;
use App\Models\Payment;
use App\Models\PlanTier;
use App\Models\User;
use App\Services\Paystack\PaystackClient;
use App\Services\Paystack\PaystackException;
use App\Support\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Organizations paying for a plan tier through Paystack (web only). An
 * admin starts a checkout for a tier and 1–12 months; Paystack takes the
 * money and sends them back. The payment is then settled from Paystack's
 * own record of it — on the redirect back (verify) or the webhook,
 * whichever comes first; settling twice changes nothing.
 *
 * A successful payment puts the organization on the paid plan in that tier:
 * the same tier is extended from its current last day; a different one
 * starts today, with the days left on the old tier converted at the two
 * tiers' prices and added on. A paid plan the owner set without a tier
 * keeps its days, and the new tier follows them.
 */
class BillingService
{
    public function __construct(private readonly PaystackClient $paystack) {}

    /** @return array{Payment, string} the pending payment and the Paystack checkout URL to send the admin to */
    public function checkout(User $admin, PlanTier $tier, int $months): array
    {
        $organization = $admin->organization;
        if ($organization->effectivePlan() === Plan::Paid && $organization->paid_until === null) {
            throw ValidationException::withMessages(['plan_tier_id' => 'Your paid plan has no end date, so there’s nothing to pay for. Ask the platform owner to change it.']);
        }

        $payment = Payment::create([
            'organization_id' => $organization->id,
            'plan_tier_id' => $tier->id,
            'user_id' => $admin->id,
            'reference' => 'SUB-'.$organization->id.'-'.Str::upper(Str::random(12)),
            'months' => $months,
            'amount_kobo' => $tier->priceKobo($months),
        ]);

        try {
            $checkout = $this->paystack->initialize($admin->email, $payment->amount_kobo, $payment->reference, (string) config('services.paystack.callback_url'), [
                'organization_id' => $organization->id,
                'organization' => $organization->name,
                'plan' => $tier->name,
                'months' => $months,
                'payment_id' => $payment->id,
            ]);
        } catch (PaystackException $e) {
            $payment->update(['status' => 'failed', 'failure_reason' => Str::limit($e->getMessage(), 250)]);
            throw $e;
        }

        return [$payment, $checkout['authorization_url']];
    }

    /** Ask Paystack how a still-pending payment went, and settle it. */
    public function verify(Payment $payment): Payment
    {
        if (! $payment->isPending()) {
            return $payment;
        }

        return $this->settle($payment, $this->paystack->verify($payment->reference));
    }

    /**
     * Settle a payment from Paystack's record of the transaction (verify's
     * data, or a charge.success webhook's). Only a pending payment changes,
     * and only to success when the amount and currency are what was asked.
     *
     * @param  array<string, mixed>  $transaction
     */
    public function settle(Payment $payment, array $transaction): Payment
    {
        return DB::transaction(function () use ($payment, $transaction) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            if (! $payment->isPending()) {
                return $payment;
            }

            $status = (string) ($transaction['status'] ?? '');
            if ($status !== 'success') {
                // Still with the payer (ongoing, pending, …): leave it be.
                if (in_array($status, ['failed', 'abandoned', 'reversed'], true)) {
                    $payment->update([
                        'status' => $status === 'abandoned' ? 'abandoned' : 'failed',
                        'failure_reason' => Str::limit((string) ($transaction['gateway_response'] ?? $status), 250),
                    ]);
                }

                return $payment;
            }

            if ((int) ($transaction['amount'] ?? 0) !== $payment->amount_kobo || strtoupper((string) ($transaction['currency'] ?? '')) !== $payment->currency) {
                $payment->update(['status' => 'failed', 'failure_reason' => 'Amount or currency paid doesn’t match the checkout.']);

                return $payment;
            }

            $organization = Organization::query()->lockForUpdate()->findOrFail($payment->organization_id);
            [$start, $end, $credit] = $this->period($organization, $payment);

            $payment->update([
                'status' => 'success',
                'channel' => isset($transaction['channel']) ? Str::limit((string) $transaction['channel'], 30, '') : null,
                'gateway_id' => $transaction['id'] ?? null,
                'paid_at' => isset($transaction['paid_at']) ? CarbonImmutable::parse($transaction['paid_at']) : CarbonImmutable::now(),
                'period_start' => $start,
                'period_end' => $end,
                'credit_days' => $credit,
            ]);
            $organization->update(['plan' => Plan::Paid, 'plan_tier_id' => $payment->plan_tier_id, 'paid_until' => $end]);

            $naira = number_format($payment->amount_kobo / 100);
            $months = $payment->months === 1 ? '1 month' : "{$payment->months} months";
            AuditLog::record('organization.paid', "₦{$naira} paid for the {$payment->tier->name} plan, {$months}, to {$end->toDateString()} (ref {$payment->reference})",
                $payment, actor: $payment->user);

            return $payment;
        });
    }

    /**
     * When the paid period runs, and how many days carried over from another tier.
     *
     * @return array{CarbonImmutable, CarbonImmutable, int}
     */
    private function period(Organization $organization, Payment $payment): array
    {
        $today = Organization::today();
        $daysLeft = $organization->daysLeft() ?? 0; // 0 on the free plan or a lapsed one
        $credit = 0;

        if ($daysLeft > 0 && ($organization->plan_tier_id === $payment->plan_tier_id || $organization->plan_tier_id === null)) {
            // The same tier, or an owner-set paid plan: carry on from its last day.
            $start = CarbonImmutable::parse($organization->paid_until->toDateString(), $today->getTimezone())->addDay();
        } else {
            $start = $today;
            $old = $organization->tier;
            if ($daysLeft > 0 && $old && $payment->tier->monthly_price > 0) {
                $credit = min(3650, intdiv($daysLeft * $old->monthly_price, $payment->tier->monthly_price));
            }
        }

        return [$start, $start->addMonthsNoOverflow($payment->months)->subDay()->addDays($credit), $credit];
    }
}
