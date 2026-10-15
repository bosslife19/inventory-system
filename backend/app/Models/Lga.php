<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lga extends Model
{
    protected $fillable = ['state_id', 'name'];

    /** Every LGA has one store (Facility::storeForLga). Bulk loads call Facility::ensureStores(). */
    protected static function booted(): void
    {
        static::created(fn (Lga $lga) => Facility::storeForLga($lga));
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
