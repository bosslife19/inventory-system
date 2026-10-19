<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An Average Monthly Consumption a facility or store enters for a product
 * while its own history is too short to compute one (e.g. newly onboarded).
 * ReorderService uses it until the facility has a full AMC window of records.
 */
class FacilityProductAmc extends Model
{
    protected $fillable = ['facility_id', 'product_id', 'amc_quantity', 'updated_by'];

    protected function casts(): array
    {
        return [
            'amc_quantity' => 'float',
        ];
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
