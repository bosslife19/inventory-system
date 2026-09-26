<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class State extends Model
{
    protected $fillable = ['name', 'geopolitical_zone'];

    public function lgas(): HasMany
    {
        return $this->hasMany(Lga::class);
    }
}
