<?php

namespace App\Reports;

use App\Models\Facility;
use App\Services\ReorderService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;

/**
 * The month- or quarter-end stock movement summary per facility and product
 * — "Sheet2" of the client's E-Stock Cards template:
 *
 *   closing stock      = opening + received − used ± losses / adjustments
 *   physical inventory = what was counted at the end of the period (if it was)
 *   quantity to order  = AMC × max months of stock (the max stock quantity)
 *   quantity required  = quantity to order − physical inventory
 *
 * Opening stock is the balance at the start of the period: the physical
 * inventory taken at the end of the last one when that was the product's
 * last entry, else the system balance ("not counted"). Received = receipts +
 * transfers in; used = issues + transfers out; losses / adjustments are
 * signed (+ adds stock) and leave out physical-inventory differences, which
 * show up instead as physical inventory − closing stock.
 *
 * Within one facility and product the ledger refuses back-dating, so the
 * highest id before a date is the last entry before it.
 */
class StockMovementReport extends Report
{
    /** @var array<int, array<int, array{amc: float|null, months: int}>> AMC by facility, then product */
    private array $amcs = [];

    private CarbonImmutable $start;

    private CarbonImmutable $next;

    public function __construct(private readonly ReorderService $reorder) {}

    public function title(): string
    {
        return 'Stock movement summary';
    }

    public function rules(): array
    {
        return [
            /** A month (YYYY-MM) or a quarter (YYYY-Q1 … YYYY-Q4). */
            'period' => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/'],
        ];
    }

    public function columns(ReportScope $scope): array
    {
        return [
            ...$this->placeColumns($scope),
            ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
            ['key' => 'product', 'label' => 'Product', 'type' => 'text'],
            ['key' => 'unit', 'label' => 'Unit', 'type' => 'text'],
            ['key' => 'opening', 'label' => 'Opening stock', 'type' => 'number'],
            ['key' => 'opening_from', 'label' => 'Opening from', 'type' => 'text'],
            ['key' => 'received', 'label' => 'Quantity received', 'type' => 'number'],
            ['key' => 'used', 'label' => 'Quantity used', 'type' => 'number'],
            ['key' => 'loss_adjustment', 'label' => 'Losses / adj.', 'type' => 'number'],
            ['key' => 'closing', 'label' => 'Closing stock', 'type' => 'number'],
            ['key' => 'physical', 'label' => 'Physical inventory', 'type' => 'number'],
            ['key' => 'difference', 'label' => 'Difference', 'type' => 'number'],
            ['key' => 'amc', 'label' => 'AMC', 'type' => 'number'],
            ['key' => 'to_order', 'label' => 'Quantity to order (max stock)', 'type' => 'number'],
            ['key' => 'required', 'label' => 'Quantity required', 'type' => 'number'],
            ['key' => 'comments', 'label' => 'Comments', 'type' => 'text'],
        ];
    }

    /** @return array{CarbonImmutable, CarbonImmutable} the first day of the period, and of the one after */
    public static function period(string $period): array
    {
        if (preg_match('/^(\d{4})-Q([1-4])$/', $period, $m)) {
            $start = CarbonImmutable::create((int) $m[1], ((int) $m[2] - 1) * 3 + 1, 1);

            return [$start, $start->addMonths(3)];
        }
        $start = CarbonImmutable::createFromFormat('!Y-m', $period);

        return [$start, $start->addMonth()];
    }

    public function query(ReportScope $scope, array $filters): Builder
    {
        [$this->start, $this->next] = self::period($filters['period']);
        $start = $this->start->toDateString();
        $in = fn (string $types) => "transaction_date >= ? and transaction_type in ({$types})";

        $movements = DB::table('stock_transactions')
            ->whereIn('facility_id', $scope->facilityIds())
            ->where('transaction_date', '<', $this->next->toDateString())
            ->groupBy('facility_id', 'product_id')
            ->selectRaw('facility_id, product_id, max(case when transaction_date < ? then id end) as before_id, max(id) as last_id', [$start])
            ->selectRaw('sum(case when '.$in("'receipt', 'transfer_in'").' then quantity else 0 end) as received', [$start])
            ->selectRaw('sum(case when '.$in("'issue', 'transfer_out'").' then quantity else 0 end) as used', [$start])
            ->selectRaw('sum(case when '.$in("'adjustment_in'").' then quantity when '.$in("'loss', 'adjustment_out'").' then -quantity else 0 end) as loss_adjustment', [$start, $start]);

        $query = DB::query()
            ->fromSub($movements, 'm')
            ->join('products as p', 'p.id', '=', 'm.product_id')
            ->leftJoin('stock_transactions as o', 'o.id', '=', 'm.before_id')
            ->join('stock_transactions as c', 'c.id', '=', 'm.last_id')
            ->leftJoin('facility_product_amcs as fpa', fn (JoinClause $j) => $j
                ->on('fpa.facility_id', '=', 'm.facility_id')->on('fpa.product_id', '=', 'm.product_id'))
            ->leftJoin('facility_product_levels as fpl', fn (JoinClause $j) => $j
                ->on('fpl.facility_id', '=', 'm.facility_id')->on('fpl.product_id', '=', 'm.product_id'))
            ->select([
                'm.facility_id', 'm.product_id', 'm.received', 'm.used', 'm.loss_adjustment',
                'o.running_balance as opening', 'o.transaction_type as opening_type', 'o.transaction_date as opening_date',
                'c.running_balance as last_balance', 'c.transaction_type as last_type', 'c.transaction_date as last_date',
                'fpa.amc_quantity as entered_amc', 'p.sku', 'p.name as product_name', 'p.unit_of_measure',
            ])
            ->selectRaw('COALESCE(fpl.max_stock_level, p.max_stock_level) as max_stock_level');
        ReportScope::joinPlace($query, 'm.facility_id');

        return $this->filterProducts($query, $filters)->orderBy('s.name')->orderBy('l.name')->orderBy('f.name')->orderBy('p.name')->orderBy('m.product_id');
    }

    public function row(object $r): array
    {
        $opening = (int) ($r->opening ?? 0);
        $closing = $opening + (int) $r->received - (int) $r->used + (int) $r->loss_adjustment;
        // Counted at the end of the period: the product's last entry in it is a physical inventory.
        $counted = $r->last_type === 'physical_count' && substr($r->last_date, 0, 10) >= $this->start->toDateString();
        $physical = $counted ? (int) $r->last_balance : null;

        $computed = $this->amcsFor((int) $r->facility_id)[$r->product_id] ?? ['amc' => null, 'months' => 0];
        ['amc' => $amc, 'source' => $source] = ReorderService::effectiveAmc(
            $computed['amc'], $computed['months'], $r->entered_amc !== null ? (float) $r->entered_amc : null,
        );
        $plan = ReorderService::plan($amc, (int) $r->max_stock_level, $physical ?? $closing);

        $comments = array_filter([
            $physical === null ? 'No physical inventory at the end of the period; required is from closing stock' : null,
            $physical !== null && $physical !== $closing ? 'Physical inventory differs from closing stock' : null,
            $plan['basis'] !== 'amc' ? 'No AMC yet: to order is the product’s max level' : null,
            $source === 'entered' ? 'Entered (starting) AMC' : null,
        ]);

        return [
            ...$this->place($r),
            'sku' => $r->sku,
            'product' => $r->product_name,
            'unit' => $r->unit_of_measure,
            'opening' => $opening,
            'opening_from' => match (true) {
                $r->opening_type === null => 'New this period',
                $r->opening_type === 'physical_count' => 'Physical inventory '.substr($r->opening_date, 0, 10),
                default => 'System balance (not counted)',
            },
            'received' => (int) $r->received,
            'used' => (int) $r->used,
            'loss_adjustment' => (int) $r->loss_adjustment,
            'closing' => $closing,
            'physical' => $physical,
            'difference' => $physical === null ? null : $physical - $closing,
            'amc' => $amc,
            'to_order' => $plan['max'],
            'required' => $plan['suggested'],
            'comments' => implode('. ', $comments) ?: null,
        ];
    }

    /**
     * AMC as at the end of the period: issues over the `inventory.amc_months`
     * complete months up to it — for a quarter just ended, its usage ÷ 3.
     *
     * @return array<int, array{amc: float|null, months: int}>
     */
    private function amcsFor(int $facilityId): array
    {
        return $this->amcs[$facilityId] ??= $this->reorder->amc(Facility::findOrFail($facilityId), $this->next);
    }
}
