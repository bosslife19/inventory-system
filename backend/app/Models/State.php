<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class State extends Model
{
    protected $fillable = ['name', 'geopolitical_zone'];

    /** Every state has one store (Facility::storeForState). Bulk loads call Facility::ensureStores(). */
    protected static function booted(): void
    {
        static::created(fn (State $state) => Facility::storeForState($state));
    }

    public function lgas(): HasMany
    {
        return $this->hasMany(Lga::class);
    }
}
