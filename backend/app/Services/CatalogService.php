<?php

namespace App\Services;

use App\Models\Facility;
use App\Models\User;
use App\Models\Product;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Adding products and facilities, one at a time (the forms) or many
 * (bulk import). Callers validate and authorize first; this only writes,
 * with its audit event.
 */
class CatalogService
{
    /** @param  array<string, mixed>  $data  validated by SaveProductRequest */
    public function addProduct(array $data, User $by): Product
    {
        return DB::transaction(function () use ($data, $by) {
            $product = Product::create([...$data, 'is_active' => $data['is_active'] ?? true, 'created_by' => $by->id]);
            AuditLog::record('product.created', "Product {$product->sku} — {$product->name} added to the catalog", $product,
                place: AuditLog::placeOfUser($by),
                changes: AuditLog::snapshot($product, ['sku', 'name', 'category', 'unit_of_measure', 'pack_size', 'requires_batch_tracking', 'requires_cold_chain', 'min_stock_level', 'reorder_level', 'max_stock_level']));

            return $product;
        });
    }

    /** @param  array<string, mixed>  $data  validated by SaveFacilityRequest */
    public function addFacility(array $data): Facility
    {
        return DB::transaction(function () use ($data) {
            $facility = Facility::create([...$data, 'is_active' => $data['is_active'] ?? true]);
            AuditLog::record('facility.created', "Facility {$facility->name} added to {$facility->lga->name} LGA", $facility, $facility,
                AuditLog::snapshot($facility, ['name', 'type', 'address', 'phone', 'latitude', 'longitude']));

            return $facility;
        });
    }
}
