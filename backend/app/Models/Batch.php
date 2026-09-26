<?php

namespace App\Models;

use App\Casts\DateOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Batch extends Model
{
    protected $fillable = ['product_id', 'batch_no', 'manufacture_date', 'expiry_date'];

    protected function casts(): array
    {
        return [
            'manufacture_date' => DateOnly::class,
            'expiry_date' => DateOnly::class,
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
