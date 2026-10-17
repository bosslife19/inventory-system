<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A facility's (or store's) own min / EOP / max for one product, set by the
 * people who keep its Stock Card. Without one, the catalog's levels apply.
 */
class FacilityProductLevel extends Model
{
    protected $fillable = ['facility_id', 'product_id', 'min_stock_level', 'reorder_level', 'max_stock_level', 'updated_by'];

    protected function casts(): array
    {
        return [
            'min_stock_level' => 'integer',
            'reorder_level' => 'integer',
            'max_stock_level' => 'integer',
        ];
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
