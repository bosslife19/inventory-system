<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'name', 'sku', 'category', 'unit_of_measure',
        'requires_batch_tracking', 'requires_cold_chain',
        'min_stock_level', 'max_stock_level', 'reorder_level', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'requires_batch_tracking' => 'boolean',
            'requires_cold_chain' => 'boolean',
            'min_stock_level' => 'integer',
            'max_stock_level' => 'integer',
            'reorder_level' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }
}
