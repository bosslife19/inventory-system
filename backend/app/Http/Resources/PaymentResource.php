<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A Paystack payment for a plan tier.
 *
 * @mixin Payment
 */
class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            /** @var array{id: int, name: string} */
            'plan_tier' => ['id' => $this->plan_tier_id, 'name' => $this->tier->name],
            'months' => $this->months,
            /**
             * Naira (amount_kobo / 100).
             *
             * @var int
             */
            'amount' => intdiv($this->amount_kobo, 100),
            'currency' => $this->currency,
            /**
             * pending = sent to Paystack, not finished (or not yet confirmed).
             *
             * @var 'pending'|'success'|'failed'|'abandoned'
             */
            'status' => $this->status,
            /** How it was paid (card, bank_transfer, ussd, …) once it succeeds. */
            'channel' => $this->channel,
            'failure_reason' => $this->failure_reason,
            /** Who started it; null if that account is gone. */
            'paid_by' => $this->user?->name,
            'paid_at' => $this->paid_at?->toIso8601String(),
            /** The days it paid for (Y-m-d), once it succeeds. */
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            /** Days carried over from the previous tier and added to the end. */
            'credit_days' => $this->credit_days,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
