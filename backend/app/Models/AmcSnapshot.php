<?php

namespace App\Models;

use App\Casts\DateOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Average Monthly Consumption for one facility + product + month. Written only by stock:compute-amc. */
class AmcSnapshot extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'facility_id', 'product_id', 'period_month', 'amc_quantity', 'months_used',
        'months_of_stock', 'suggested_reorder_quantity',
    ];

    protected function casts(): array
    {
        return [
            'period_month' => DateOnly::class,
            'amc_quantity' => 'float',
            'months_used' => 'integer',
            'months_of_stock' => 'float',
            'suggested_reorder_quantity' => 'integer',
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
}
