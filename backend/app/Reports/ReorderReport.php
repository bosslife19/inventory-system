<?php

namespace App\Reports;

use App\Services\ReorderService;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;

/**
 * The Bin Card summary per facility and product: usable stock, Average
 * Monthly Consumption (latest amc_snapshots row), months of stock and the
 * quantity to order — the same arithmetic as the facility's reorder
 * suggestions (ReorderService::plan).
 */
class ReorderReport extends Report
{
    public function title(): string
    {
        return 'Reorder and consumption';
    }

    public function rules(): array
    {
        return [
            /** Only products that need ordering. */
            'needs_order' => ['nullable', 'boolean'],
        ];
    }

    public function columns(ReportScope $scope): array
    {
        return [
            ...$this->placeColumns($scope),
            ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
            ['key' => 'product', 'label' => 'Product', 'type' => 'text'],
            ['key' => 'unit', 'label' => 'Unit', 'type' => 'text'],
            ['key' => 'usable', 'label' => 'Usable', 'type' => 'number'],
            ['key' => 'amc', 'label' => 'AMC', 'type' => 'number'],
            ['key' => 'months_of_stock', 'label' => 'Months of stock', 'type' => 'number'],
            ['key' => 'max_stock', 'label' => 'Max stock', 'type' => 'number'],
            ['key' => 'basis', 'label' => 'Max based on', 'type' => 'text'],
            ['key' => 'to_order', 'label' => 'Quantity to order', 'type' => 'number'],
        ];
    }

    public function query(ReportScope $scope, array $filters): Builder
    {
        // Latest AMC period per facility + product.
        $latest = DB::table('amc_snapshots')
            ->whereIn('facility_id', $scope->facilityIds())
            ->groupBy('facility_id', 'product_id')
            ->selectRaw('facility_id, product_id, max(period_month) as period_month');

        $query = DB::table('facility_product_status as fps')
            ->join('products as p', 'p.id', '=', 'fps.product_id')
            ->leftJoinSub($latest, 'lat', fn (JoinClause $j) => $j->on('lat.facility_id', '=', 'fps.facility_id')->on('lat.product_id', '=', 'fps.product_id'))
            ->leftJoin('amc_snapshots as a', fn (JoinClause $j) => $j
                ->on('a.facility_id', '=', 'fps.facility_id')
                ->on('a.product_id', '=', 'fps.product_id')
                ->on('a.period_month', '=', 'lat.period_month'))
            ->whereIn('fps.facility_id', $scope->facilityIds())
            ->select(['fps.usable_quantity', 'a.amc_quantity', 'p.sku', 'p.name as product_name', 'p.unit_of_measure', 'p.max_stock_level']);
        ReportScope::joinPlace($query, 'fps.facility_id');

        return $this->filterProducts($query, $filters)->orderBy('s.name')->orderBy('l.name')->orderBy('f.name')->orderBy('p.name')->orderBy('fps.id');
    }

    public function row(object $r): array
    {
        $amc = $r->amc_quantity !== null ? (float) $r->amc_quantity : null;
        $plan = ReorderService::plan($amc, (int) $r->max_stock_level, (int) $r->usable_quantity);

        return [
            ...$this->place($r),
            'sku' => $r->sku,
            'product' => $r->product_name,
            'unit' => $r->unit_of_measure,
            'usable' => (int) $r->usable_quantity,
            'amc' => $amc,
            'months_of_stock' => $plan['months_of_stock'],
            'max_stock' => $plan['max'],
            'basis' => $plan['basis'] === 'amc' ? 'Consumption (AMC)' : 'Product max level',
            'to_order' => $plan['suggested'],
        ];
    }

    /** needs_order is applied after the arithmetic, since the quantity is computed per row. */
    public function keep(array $row, array $filters): bool
    {
        return empty($filters['needs_order']) || $row['to_order'] > 0;
    }
}
