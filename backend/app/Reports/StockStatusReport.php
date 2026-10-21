<?php

namespace App\Reports;

use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Current stock per facility and product: on hand, usable, expired, level
 * against the thresholds it was judged by. From facility_product_status, the same snapshot
 * the dashboards use (refreshed on every ledger write and daily for expiry).
 */
class StockStatusReport extends Report
{
    public function title(): string
    {
        return 'Stock status';
    }

    public function rules(): array
    {
        return [
            /** Only rows at this level: stock_out, low_stock, reorder, ok. */
            'level' => ['nullable', Rule::in(['stock_out', 'low_stock', 'reorder', 'ok'])],
        ];
    }

    public function columns(ReportScope $scope): array
    {
        return [
            ...$this->placeColumns($scope),
            ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
            ['key' => 'product', 'label' => 'Product', 'type' => 'text'],
            ['key' => 'unit', 'label' => 'Unit', 'type' => 'text'],
            ['key' => 'on_hand', 'label' => 'On hand', 'type' => 'number'],
            ['key' => 'usable', 'label' => 'Usable', 'type' => 'number'],
            ['key' => 'expired', 'label' => 'Expired', 'type' => 'number'],
            ['key' => 'expiring_soon', 'label' => 'Expiring soon', 'type' => 'number'],
            ['key' => 'level', 'label' => 'Level', 'type' => 'text'],
            ['key' => 'min', 'label' => 'Min', 'type' => 'number'],
            ['key' => 'eop', 'label' => 'EOP', 'type' => 'number'],
            ['key' => 'max', 'label' => 'Max', 'type' => 'number'],
            ['key' => 'last_entry', 'label' => 'Last entry', 'type' => 'date'],
        ];
    }

    public function query(ReportScope $scope, array $filters): Builder
    {
        $query = DB::table('facility_product_status as fps')
            ->join('products as p', 'p.id', '=', 'fps.product_id')
            ->leftJoin('facility_product_levels as fpl', fn (JoinClause $j) => $j
                ->on('fpl.facility_id', '=', 'fps.facility_id')->on('fpl.product_id', '=', 'fps.product_id'))
            ->whereIn('fps.facility_id', $scope->facilityIds())
            ->when($filters['level'] ?? null, fn ($q, $level) => $q->where('fps.level', $level))
            ->select([
                'fps.quantity_on_hand', 'fps.usable_quantity', 'fps.expired_quantity', 'fps.expiring_soon_quantity',
                'fps.level', 'fps.last_transaction_date',
                'p.sku', 'p.name as product_name', 'p.unit_of_measure',
            ])
            // The levels the row was judged against (AMC-based or fixed); for a row not
            // refreshed since they were stored, the facility's own fixed levels, else the catalog's.
            ->selectRaw('COALESCE(fps.min_stock_level, fpl.min_stock_level, p.min_stock_level) as min_stock_level')
            ->selectRaw('COALESCE(fps.reorder_level, fpl.reorder_level, p.reorder_level) as reorder_level')
            ->selectRaw('COALESCE(fps.max_stock_level, fpl.max_stock_level, p.max_stock_level) as max_stock_level');
        ReportScope::joinPlace($query, 'fps.facility_id');

        return $this->filterProducts($query, $filters)->orderBy('s.name')->orderBy('l.name')->orderBy('f.name')->orderBy('p.name')->orderBy('fps.id');
    }

    public function row(object $r): array
    {
        return [
            ...$this->place($r),
            'sku' => $r->sku,
            'product' => $r->product_name,
            'unit' => $r->unit_of_measure,
            'on_hand' => (int) $r->quantity_on_hand,
            'usable' => (int) $r->usable_quantity,
            'expired' => (int) $r->expired_quantity,
            'expiring_soon' => (int) $r->expiring_soon_quantity,
            'level' => self::LEVELS[$r->level] ?? $r->level,
            'min' => (int) $r->min_stock_level,
            'eop' => (int) $r->reorder_level,
            'max' => (int) $r->max_stock_level,
            'last_entry' => $r->last_transaction_date ? substr($r->last_transaction_date, 0, 10) : null,
        ];
    }

    public const LEVELS = ['stock_out' => 'Stock-out', 'low_stock' => 'At / below EOP', 'reorder' => 'Below min', 'ok' => 'OK'];
}
