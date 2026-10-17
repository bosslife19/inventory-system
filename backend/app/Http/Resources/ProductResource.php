<?php

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'sku' => $this->sku,
            'category' => $this->category,
            'unit_of_measure' => $this->unit_of_measure,
            /** Pieces in each unit (pack, box, carton…); null for single-piece units. */
            'pack_size' => $this->pack_size,
            'requires_batch_tracking' => $this->requires_batch_tracking,
            'requires_cold_chain' => $this->requires_cold_chain,
            'min_stock_level' => $this->min_stock_level,
            'max_stock_level' => $this->max_stock_level,
            'reorder_level' => $this->reorder_level,
            'is_active' => $this->is_active,
            /** Who added it (may edit it, as may admins); null for seeded products. */
            'created_by' => $this->created_by,
        ];
    }
}
