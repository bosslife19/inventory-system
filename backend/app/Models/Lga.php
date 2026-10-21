<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lga extends Model
{
    protected $fillable = ['state_id', 'name'];

    /** Every LGA has one store in each organization (Facility::storeForLga). Bulk loads call Facility::ensureStores(). */
    protected static function booted(): void
    {
        static::created(fn (Lga $lga) => Organization::query()->pluck('id')->each(fn (int $org) => Facility::storeForLga($lga, $org)));
    }

    public function state(): BelongsTo
    {
        return $this->belongsTo(State::class);
    }

    /** Includes the LGA's store; add ->servicePoints() for SDPs only. */
    public function facilities(): HasMany
    {
        return $this->hasMany(Facility::class);
    }
}
