<?php

namespace App\Imports;

use App\Http\Requests\SaveProductRequest;
use App\Models\Facility;
use App\Models\User;
use App\Services\CatalogService;
use Illuminate\Auth\Access\Response;

/** New catalog products, as POST /products. Anyone signed in may add products. */
class ProductImporter extends Importer
{
    public function __construct(private readonly CatalogService $catalog) {}

    public function columns(): array
    {
        return [
            new ImportColumn('product_code', true, 'Short unique code, as printed on delivery notes.', 'AMX250', 'sku'),
            new ImportColumn('name', true, 'Full product name.', 'Amoxicillin 250mg dispersible tablets'),
            new ImportColumn('category', true, 'Group it belongs to.', 'Antibiotics'),
            new ImportColumn('unit_of_measure', true, 'What one counts as: piece, tablet, capsule, sachet, ampoule, vial, bottle, tube, pair, roll, pack, box, carton, bag or kit.', 'pack'),
            new ImportColumn('pack_size', false, 'Pieces in each pack / box / carton / bag / kit. Needed for those units only.', '10'),
            new ImportColumn('track_batches', false, 'yes or no: every entry needs a batch number and expiry. Blank means yes.', 'yes', 'requires_batch_tracking'),
            new ImportColumn('cold_chain', false, 'yes or no: stored refrigerated. Blank means no.', 'no', 'requires_cold_chain'),
            new ImportColumn('eop', true, 'Emergency order point: below the minimum; alerts go out when stock reaches it.', '20', 'reorder_level'),
            new ImportColumn('min_stock_level', true, 'Minimum level: below it, time to order.', '50'),
            new ImportColumn('max_stock_level', true, 'Maximum level.', '200'),
        ];
    }

    public function authorize(User $user, ?Facility $facility): Response
    {
        return Response::allow();
    }

    public function import(array $row, User $user, ?Facility $facility): array
    {
        $request = $this->validate(SaveProductRequest::class, [
            'sku' => $row['product_code'],
            'name' => $row['name'],
            'category' => $row['category'],
            'unit_of_measure' => $row['unit_of_measure'],
            'pack_size' => self::number($row['pack_size'] ?? null),
            'requires_batch_tracking' => self::yesNo($row['track_batches'] ?? null, true),
            'requires_cold_chain' => self::yesNo($row['cold_chain'] ?? null, false),
            'min_stock_level' => self::number($row['min_stock_level']),
            'reorder_level' => self::number($row['eop']),
            'max_stock_level' => self::number($row['max_stock_level']),
        ], $user);

        $product = $this->catalog->addProduct($request->validated(), $user);

        return ['label' => "{$product->sku} — {$product->name}"];
    }
}
