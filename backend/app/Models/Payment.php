<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Paystack checkout for a plan tier and a number of months. It starts
 * pending; BillingService settles it from Paystack's answer (the redirect
 * back, or the webhook — whichever comes first) and, on success, moves the
 * organization's paid_until on. Amount and price are fixed at checkout.
 */
class Payment extends Model
{
    public const MONTHS = [1, 3, 6, 12];

    protected $fillable = [
        'organization_id', 'plan_tier_id', 'user_id', 'reference', 'months', 'amount_kobo', 'currency', 'status',
        'channel', 'gateway_id', 'failure_reason', 'paid_at', 'period_start', 'period_end', 'credit_days',
    ];

    protected $attributes = [
        'status' => 'pending',
        'currency' => 'NGN',
        'credit_days' => 0,
    ];

    protected function casts(): array
    {
        return [
            'months' => 'integer',
            'amount_kobo' => 'integer',
            'gateway_id' => 'integer',
            'credit_days' => 'integer',
            'paid_at' => 'immutable_datetime',
            'period_start' => 'immutable_date',
            'period_end' => 'immutable_date',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function tier(): BelongsTo
    {
        return $this->belongsTo(PlanTier::class, 'plan_tier_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }
}
