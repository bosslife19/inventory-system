<?php

namespace App\Models;

use App\Casts\DateOnly;
use App\Enums\StockLevel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Materialized stock status per facility + product, for rollups. Written only by StockStatusSnapshot. */
class FacilityProductStatus extends Model
{
    protected $table = 'facility_product_status';

    public $timestamps = false;

    protected $fillable = [
        'facility_id', 'product_id', 'quantity_on_hand', 'usable_quantity', 'expired_quantity',
        'expiring_soon_quantity', 'level', 'flag_stock_out', 'flag_expired', 'flag_low_stock',
        'flag_expiring_soon', 'last_transaction_date', 'refreshed_at',
    ];

    protected function casts(): array
    {
        return [
            'level' => StockLevel::class,
            'flag_stock_out' => 'boolean',
            'flag_expired' => 'boolean',
            'flag_low_stock' => 'boolean',
            'flag_expiring_soon' => 'boolean',
            'last_transaction_date' => DateOnly::class,
            'refreshed_at' => 'datetime',
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
