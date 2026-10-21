<?php

namespace App\Imports;

use App\Http\Requests\SaveEnteredAmcRequest;
use App\Http\Requests\SaveProductLevelsRequest;
use App\Models\Facility;
use App\Models\Product;
use App\Models\User;
use App\Services\ProductLevelService;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;

/**
 * One facility's or store's own min / EOP / max and starting AMC per
 * product, as its Stock levels page. A row may set the levels, the AMC, or both.
 */
class ProductLevelImporter extends Importer
{
    /** @var array<int, true> products whose thresholds changed, refreshed after commit */
    private array $changed = [];

    public function __construct(private readonly ProductLevelService $levels) {}

    public function forFacility(): bool
    {
        return true;
    }

    public function columns(): array
    {
        return [
            new ImportColumn('product_code', true, 'Code of a product in the catalog.', 'AMX250'),
            new ImportColumn('eop', false, 'This facility’s emergency order point, below its minimum. Give all three levels or none.', '20', 'reorder_level'),
            new ImportColumn('min_stock_level', false, 'This facility’s minimum level.', '50'),
            new ImportColumn('max_stock_level', false, 'This facility’s maximum level.', '200'),
            new ImportColumn('starting_amc', false, 'Expected issues per month, used until the facility has 3 months of records of its own.', '40', 'amc_quantity'),
        ];
    }

    public function authorize(User $user, ?Facility $facility): Response
    {
        return Gate::forUser($user)->inspect('setLevels', $facility);
    }

    public function import(array $row, User $user, ?Facility $facility): array
    {
        $product = self::findProduct($row['product_code']);
        $levels = array_map(self::number(...), [
            'min_stock_level' => $row['min_stock_level'] ?? null,
            'reorder_level' => $row['eop'] ?? null,
            'max_stock_level' => $row['max_stock_level'] ?? null,
        ]);
        $amc = self::number($row['starting_amc'] ?? null);
        $hasLevels = array_filter($levels, fn ($v) => $v !== null) !== [];
        if (! $hasLevels && $amc === null) {
            self::fail('product_code', 'Nothing to set: give the levels, a starting AMC, or both.');
        }

        $set = [];
        if ($hasLevels) {
            $request = $this->validate(SaveProductLevelsRequest::class, $levels, $user, ['facility' => $facility]);
            $own = $this->levels->setLevels($facility, $product, $request->validated(), $user, deferDerived: true);
            $this->changed[$product->id] = true;
            $set[] = "min {$own->min_stock_level}, EOP {$own->reorder_level}, max {$own->max_stock_level}";
        }
        if ($amc !== null) {
            $request = $this->validate(SaveEnteredAmcRequest::class, ['amc_quantity' => $amc], $user, ['facility' => $facility]);
            $entered = $this->levels->setAmc($facility, $product, (float) $request->validated('amc_quantity'), $user);
            $set[] = "AMC {$entered->amc_quantity}";
        }

        return ['label' => "{$product->sku} — ".implode('; ', $set)];
    }

    public function afterCommit(?Facility $facility): void
    {
        foreach (array_keys($this->changed) as $productId) {
            $this->levels->refreshDerived($facility, $productId);
        }
    }

    /** By product code, ignoring case. Shared with the stock entries import. */
    public static function findProduct(?string $code): Product
    {
        if ($code === null) {
            self::fail('product_code', 'Give the product code.');
        }

        return Product::where('sku', strtoupper(trim($code)))->first()
            ?? self::fail('product_code', "No product with code “{$code}” in the catalog.");
    }
}
