<?php

namespace App\Models;

use App\Enums\Feature;
use App\Enums\Plan;
use App\Enums\UserRole;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A partner using the system: its own facilities, stores, catalog and
 * accounts, kept apart from every other organization's. The platform owner
 * creates it, uploads its logo and sets its plan; its admins can also pay
 * for a plan tier through Paystack (BillingService). The paid plan runs to
 * paid_until (null: no end date), within its tier's limits (no tier: none).
 */
class Organization extends Model
{
    /** Members see "your plan ends in N days" from this many days out. */
    public const RENEWAL_WARNING_DAYS = 14;

    protected $fillable = [
        'name', 'logo_path', 'contact_name', 'contact_email', 'contact_phone', 'address', 'plan', 'plan_tier_id', 'paid_until', 'is_active', 'notes',
    ];

    protected $attributes = [
        'plan' => 'free',
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'plan' => Plan::class,
            'paid_until' => 'immutable_date',
            'is_active' => 'boolean',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function admins(): HasMany
    {
        return $this->users()->where('role', UserRole::Admin);
    }

    public function facilities(): HasMany
    {
        return $this->hasMany(Facility::class);
    }

    /** The paid tier as set; see effectiveTier() for what applies today. */
    public function tier(): BelongsTo
    {
        return $this->belongsTo(PlanTier::class, 'plan_tier_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** The tier whose limits apply today: none on the free plan, or on a paid plan without one (no limits). */
    public function effectiveTier(): ?PlanTier
    {
        return $this->effectivePlan() === Plan::Paid ? $this->tier : null;
    }

    /** The plan in force today: a paid plan past its last day is free again. Nothing is deleted either way. */
    public function effectivePlan(): Plan
    {
        return $this->plan === Plan::Paid && ($this->paid_until === null || $this->paid_until->toDateString() >= self::today()->toDateString())
            ? Plan::Paid
            : Plan::Free;
    }

    /** @return list<Feature> */
    public function features(): array
    {
        return $this->effectivePlan()->features();
    }

    public function hasFeature(Feature $feature): bool
    {
        return in_array($feature, $this->features(), true);
    }

    /** Days left on a paid plan with an end date, counting today; null when there's no end date or it has lapsed. */
    public function daysLeft(): ?int
    {
        if ($this->effectivePlan() !== Plan::Paid || $this->paid_until === null) {
            return null;
        }

        $lastDay = CarbonImmutable::parse($this->paid_until->toDateString(), config('app.business_timezone'));

        return (int) self::today()->diffInDays($lastDay) + 1;
    }

    public function logoUrl(): ?string
    {
        // The file name changes with each upload, so the URL can be cached forever.
        return $this->logo_path ? url("/api/v1/organizations/{$this->id}/logo/".basename($this->logo_path)) : null;
    }

    /** Plans run by the business day (Lagos), not by UTC. */
    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::now(config('app.business_timezone'))->startOfDay();
    }
}
