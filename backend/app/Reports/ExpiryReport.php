<?php

namespace App\Reports;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Batches on hand that have expired or expire within N days (default the
 * dashboards' expiring-soon window), earliest first — what to issue first,
 * move, or write off. Read live from stock_balances.
 */
class ExpiryReport extends Report
{
    private CarbonImmutable $today;

    public function __construct()
    {
        $this->today = CarbonImmutable::today(config('app.business_timezone'));
    }

    public function title(): string
    {
        return 'Expiry';
    }

    public function rules(): array
    {
        return [
            /** Include batches expiring within this many days (0–730; default INVENTORY_EXPIRING_SOON_DAYS). Expired ones are always included. */
            'within_days' => ['nullable', 'integer', 'min:0', 'max:730'],
        ];
    }

    public function columns(ReportScope $scope): array
    {
        return [
            ...$this->placeColumns($scope),
            ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
            ['key' => 'product', 'label' => 'Product', 'type' => 'text'],
            ['key' => 'batch', 'label' => 'Batch', 'type' => 'text'],
            ['key' => 'expiry_date', 'label' => 'Expiry', 'type' => 'date'],
            ['key' => 'days_left', 'label' => 'Days left', 'type' => 'number'],
            ['key' => 'status', 'label' => 'Status', 'type' => 'text'],
            ['key' => 'quantity', 'label' => 'Quantity', 'type' => 'number'],
            ['key' => 'unit', 'label' => 'Unit', 'type' => 'text'],
        ];
    }

    public function query(ReportScope $scope, array $filters): Builder
    {
        $within = (int) ($filters['within_days'] ?? config('inventory.expiring_soon_days'));

        $query = DB::table('stock_balances as sb')
            ->join('batches as b', 'b.id', '=', 'sb.batch_id')
            ->join('products as p', 'p.id', '=', 'sb.product_id')
            ->whereIn('sb.facility_id', $scope->facilityIds())
            ->where('sb.quantity_on_hand', '>', 0)
            ->where('b.expiry_date', '<=', $this->today->addDays($within)->toDateString())
            ->select(['sb.quantity_on_hand', 'b.batch_no', 'b.expiry_date', 'p.sku', 'p.name as product_name', 'p.unit_of_measure']);
        ReportScope::joinPlace($query, 'sb.facility_id');

        return $this->filterProducts($query, $filters)->orderBy('b.expiry_date')->orderBy('p.name')->orderBy('f.name')->orderBy('sb.id');
    }

    public function row(object $r): array
    {
        // Calendar dates on both sides: today is a Lagos date, the expiry a plain date.
        $expiry = CarbonImmutable::parse(substr($r->expiry_date, 0, 10));
        $days = (int) round(CarbonImmutable::parse($this->today->toDateString())->diffInDays($expiry, false));

        return [
            ...$this->place($r),
            'sku' => $r->sku,
            'product' => $r->product_name,
            'batch' => $r->batch_no,
            'expiry_date' => $expiry->toDateString(),
            'days_left' => $days,
            // Same rule as StockStatusService: expired on the expiry date itself.
            'status' => $days <= 0 ? 'Expired' : 'Expiring soon',
            'quantity' => (int) $r->quantity_on_hand,
            'unit' => $r->unit_of_measure,
        ];
    }
}
