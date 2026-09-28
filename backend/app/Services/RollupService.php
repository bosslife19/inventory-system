<?php

namespace App\Services;

use App\Data\AreaStockSummary;
use App\Data\FacilityStatusCounts;
use App\Data\FlagCounts;
use App\Data\ProductRollup;
use App\Models\Facility;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * State and Federal rollups, aggregated from facility_product_status (one row
 * per facility + product) rather than live stock_balances, so a national
 * view is a handful of GROUP BY queries however many facilities there are.
 *
 * Same meaning as the live LGA rollup (StockStatusService::rollup): a
 * facility counts once per flag however many of its products carry it.
 */
class RollupService
{
    /**
     * @param  Builder<Facility>  $facilities  facilities in the node, already scoped to the caller
     * @param  Collection<int, Model>  $children  child nodes (LGAs or States), in the caller's scope
     * @param  'lga_id'|'state_id'  $childKey  which column groups facilities under $children
     * @return array{facility_count: int, facility_counts: array<string, int>, facility_status: FacilityStatusCounts, products: list<ProductRollup>, children: list<AreaStockSummary>}
     */
    public function summarize(Builder $facilities, Collection $children, string $childKey): array
    {
        $rows = $this->facilityRows($facilities);

        $counts = $this->zeroCounts();
        $status = new FacilityStatusCounts;
        foreach ($rows as $row) {
            $this->addFlags($counts, $row);
            $status->add(self::facilityStatus($row));
        }

        $byChild = $rows->groupBy($childKey);
        $stockOuts = $this->stockOutProducts($facilities, $childKey);

        $childRows = $children->map(function (Model $child) use ($byChild, $stockOuts) {
            $facilities = $byChild[$child->id] ?? collect();
            $flags = $this->zeroCounts();
            foreach ($facilities as $row) {
                $this->addFlags($flags, $row);
            }

            return new AreaStockSummary(
                node: $child,
                facilityCount: $facilities->count(),
                reportingFacilityCount: $facilities->where('product_count', '>', 0)->count(),
                flagCounts: $flags,
                needsReorderCount: $facilities->where('needs_reorder', 1)->count(),
                lastTransactionDate: $facilities->max('last_date'),
                stockOutProducts: $stockOuts[$child->id] ?? [],
            );
        })->sort(fn (AreaStockSummary $a, AreaStockSummary $b) => $this->severityKey($b->flagCounts) <=> $this->severityKey($a->flagCounts)
            ?: $a->node->name <=> $b->node->name)->values()->all();

        return [
            'facility_count' => $rows->count(),
            'facility_counts' => $counts,
            'facility_status' => $status,
            'products' => $this->products($facilities),
            'children' => $childRows,
        ];
    }

    /**
     * A facility's worst state, counted once — the same rule the web's LGA
     * donut used, now shared. no_data = nothing recorded yet.
     *
     * @param  object{product_count: int|string, stock_out: int|string, low_stock: int|string, expired: int|string, needs_reorder: int|string}  $row
     */
    public static function facilityStatus(object $row): string
    {
        return match (true) {
            (int) $row->product_count === 0 => 'no_data',
            (int) $row->stock_out > 0 => 'stock_out',
            (int) $row->low_stock > 0 => 'low_stock',
            (int) $row->needs_reorder > 0 || (int) $row->expired > 0 => 'reorder',
            default => 'ok',
        };
    }

    /**
     * One row per facility: which flags any of its products carry.
     *
     * @param  Builder<Facility>  $facilities
     * @return Collection<int, object>
     */
    private function facilityRows(Builder $facilities): Collection
    {
        return (clone $facilities)
            ->join('lgas', 'lgas.id', '=', 'facilities.lga_id')
            ->leftJoin('facility_product_status as s', 's.facility_id', '=', 'facilities.id')
            ->groupBy('facilities.id', 'facilities.lga_id', 'lgas.state_id')
            ->selectRaw(<<<'SQL'
                facilities.id as facility_id, facilities.lga_id, lgas.state_id,
                count(s.id) as product_count,
                coalesce(max(case when s.flag_stock_out then 1 else 0 end), 0) as stock_out,
                coalesce(max(case when s.flag_expired then 1 else 0 end), 0) as expired,
                coalesce(max(case when s.flag_low_stock then 1 else 0 end), 0) as low_stock,
                coalesce(max(case when s.flag_expiring_soon then 1 else 0 end), 0) as expiring_soon,
                coalesce(max(case when s.level <> 'ok' then 1 else 0 end), 0) as needs_reorder,
                max(s.last_transaction_date) as last_date
                SQL)
            ->toBase()
            ->get()
            ->map(function (object $row) {
                foreach (['product_count', 'stock_out', 'expired', 'low_stock', 'expiring_soon', 'needs_reorder'] as $k) {
                    $row->{$k} = (int) $row->{$k};
                }
                $row->last_date = $row->last_date ? substr($row->last_date, 0, 10) : null;

                return $row;
            });
    }

    /**
     * Per-product totals across the node, in the ProductRollup shape the LGA
     * rollup returns.
     *
     * @param  Builder<Facility>  $facilities
     * @return list<ProductRollup>
     */
    private function products(Builder $facilities): array
    {
        $rows = DB::table('facility_product_status as s')
            ->whereIn('s.facility_id', (clone $facilities)->select('facilities.id'))
            ->groupBy('s.product_id')
            ->selectRaw(<<<'SQL'
                s.product_id,
                sum(s.quantity_on_hand) as quantity_on_hand,
                sum(s.usable_quantity) as usable_quantity,
                sum(s.expired_quantity) as expired_quantity,
                sum(case when s.flag_stock_out then 1 else 0 end) as stock_out,
                sum(case when s.flag_expired then 1 else 0 end) as expired,
                sum(case when s.flag_low_stock then 1 else 0 end) as low_stock,
                sum(case when s.flag_expiring_soon then 1 else 0 end) as expiring_soon,
                sum(case when s.level <> 'ok' then 1 else 0 end) as needs_reorder
                SQL)
            ->get();

        $products = Product::whereKey($rows->pluck('product_id'))->get()->keyBy('id');

        return $rows
            ->map(function (object $row) use ($products) {
                $rollup = new ProductRollup($products[$row->product_id]);
                $rollup->quantityOnHand = (int) $row->quantity_on_hand;
                $rollup->usableQuantity = (int) $row->usable_quantity;
                $rollup->expiredQuantity = (int) $row->expired_quantity;
                $rollup->facilitiesNeedingReorder = (int) $row->needs_reorder;
                $rollup->facilityCounts->stockOut = (int) $row->stock_out;
                $rollup->facilityCounts->expired = (int) $row->expired;
                $rollup->facilityCounts->lowStock = (int) $row->low_stock;
                $rollup->facilityCounts->expiringSoon = (int) $row->expiring_soon;

                return $rollup;
            })
            ->sortBy(fn (ProductRollup $r) => $r->product->name)
            ->values()
            ->all();
    }

    /**
     * The products stocked out at the most facilities, top 3 per child node.
     *
     * @param  Builder<Facility>  $facilities
     * @return array<int, list<array{product: array{id: int, name: string, sku: string}, facility_count: int}>>
     */
    private function stockOutProducts(Builder $facilities, string $childKey): array
    {
        $rows = DB::table('facility_product_status as s')
            ->join('facilities', 'facilities.id', '=', 's.facility_id')
            ->join('lgas', 'lgas.id', '=', 'facilities.lga_id')
            ->join('products', 'products.id', '=', 's.product_id')
            ->whereIn('s.facility_id', (clone $facilities)->select('facilities.id'))
            ->where('s.flag_stock_out', true)
            ->groupBy($childKey === 'lga_id' ? 'facilities.lga_id' : 'lgas.state_id', 'products.id', 'products.name', 'products.sku')
            ->selectRaw(($childKey === 'lga_id' ? 'facilities.lga_id' : 'lgas.state_id').' as child_id, products.id, products.name, products.sku, count(*) as facility_count')
            ->get();

        return $rows
            ->groupBy('child_id')
            ->map(fn (Collection $items) => $items
                ->sortBy([['facility_count', 'desc'], ['name', 'asc']])
                ->take(3)
                ->map(fn (object $r) => [
                    'product' => ['id' => (int) $r->id, 'name' => $r->name, 'sku' => $r->sku],
                    'facility_count' => (int) $r->facility_count,
                ])
                ->values()
                ->all())
            ->all();
    }

    /** @return array{stock_out: int, expired: int, low_stock: int, expiring_soon: int} */
    private function zeroCounts(): array
    {
        return (new FlagCounts)->toArray();
    }

    /** @param  array<string, int>  $counts */
    private function addFlags(array &$counts, object $row): void
    {
        foreach (array_keys($counts) as $flag) {
            $counts[$flag] += $row->{$flag} > 0 ? 1 : 0;
        }
    }

    /** @param  array<string, int>  $c */
    private function severityKey(array $c): array
    {
        return [$c['stock_out'], $c['expired'], $c['low_stock'], $c['expiring_soon']];
    }
}
