<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReorderRequestItem extends Model
{
    protected $fillable = ['reorder_request_id', 'product_id', 'quantity_requested', 'quantity_supplied'];

    protected function casts(): array
    {
        return [
            'quantity_requested' => 'integer',
            'quantity_supplied' => 'integer',
        ];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(ReorderRequest::class, 'reorder_request_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
