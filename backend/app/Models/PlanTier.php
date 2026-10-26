<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A paid plan tier: a monthly price and how many open facilities (SDPs) and
 * active accounts it allows (null = no limit). Every tier unlocks the same
 * paid features. The platform owner edits tiers; they're never deleted,
 * only withdrawn (is_active = false), since payments point at them.
 */
class PlanTier extends Model
{
    protected $fillable = ['name', 'description', 'monthly_price', 'max_facilities', 'max_accounts', 'is_active', 'sort_order'];

    protected $attributes = [
        'is_active' => true,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'monthly_price' => 'integer',
            'max_facilities' => 'integer',
            'max_accounts' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function scopeOffered(Builder $query): void
    {
        $query->where('is_active', true)->orderBy('sort_order')->orderBy('monthly_price');
    }

    /** Price for $months months, in kobo (what Paystack charges in). */
    public function priceKobo(int $months): int
    {
        return $this->monthly_price * $months * 100;
    }
}
