<?php

namespace App\Models;

use App\Enums\UnitOfMeasure;
use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** In one organization's catalog; each organization keeps its own. */
class Product extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'sku', 'category', 'unit_of_measure', 'pack_size',
        'requires_batch_tracking', 'requires_cold_chain',
        'min_stock_level', 'max_stock_level', 'reorder_level', 'is_active', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'unit_of_measure' => UnitOfMeasure::class,
            'pack_size' => 'integer',
            'requires_batch_tracking' => 'boolean',
            'requires_cold_chain' => 'boolean',
            'min_stock_level' => 'integer',
            'max_stock_level' => 'integer',
            'reorder_level' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /** Who added it to the catalog; null for seeded products. */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }
}
