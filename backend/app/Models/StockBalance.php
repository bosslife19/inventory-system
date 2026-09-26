<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Derived from stock_transactions. Written only by StockLedgerService and
 * the ReconcileStockBalances command.
 */
class StockBalance extends Model
{
    const CREATED_AT = null;

    protected $fillable = [
        'facility_id', 'product_id', 'batch_id', 'quantity_on_hand', 'last_transaction_id',
    ];

    protected $hidden = ['batch_key'];

    protected function casts(): array
    {
        return [
            'quantity_on_hand' => 'integer',
            'last_transaction_id' => 'integer',
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

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function lastTransaction(): BelongsTo
    {
        return $this->belongsTo(StockTransaction::class, 'last_transaction_id');
    }
}
