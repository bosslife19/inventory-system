<?php

namespace App\Models;

use App\Casts\DateOnly;
use App\Enums\TransactionType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * One row of the digital Stock Card. Append-only: create through
 * StockLedgerService::record(), never update or delete — corrections are
 * new adjustment_in / adjustment_out / physical_count rows.
 */
class StockTransaction extends Model
{
    protected $fillable = [
        'facility_id', 'product_id', 'batch_id', 'transaction_date', 'voucher_no',
        'counterparty', 'transaction_type', 'quantity', 'comments', 'performed_by',
        'delivery_note_id', 'running_balance',
    ];

    protected function casts(): array
    {
        return [
            'transaction_date' => DateOnly::class,
            'transaction_type' => TransactionType::class,
            'quantity' => 'integer',
            'running_balance' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('stock_transactions is append-only.'));
        static::deleting(fn () => throw new LogicException('stock_transactions is append-only.'));
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

    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
