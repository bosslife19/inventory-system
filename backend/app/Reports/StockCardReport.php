<?php

namespace App\Reports;

use App\Enums\TransactionType;
use App\Models\StockTransaction;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The paper Stock Card for one facility over a date range, in card order:
 * the Excel template's columns (date, voucher, received from / issued to,
 * batch, expiry, received, issued, losses / adjustments, balance). With one
 * product chosen it starts with the opening balance carried forward.
 */
class StockCardReport extends Report
{
    public function title(): string
    {
        return 'Stock Card';
    }

    public function facilityOnly(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            /** Inclusive, YYYY-MM-DD. */
            'from' => ['nullable', 'date_format:Y-m-d'],
            /** Inclusive, YYYY-MM-DD. */
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    public function columns(ReportScope $scope): array
    {
        return [
            ['key' => 'date', 'label' => 'Date', 'type' => 'date'],
            ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
            ['key' => 'product', 'label' => 'Product', 'type' => 'text'],
            ['key' => 'voucher', 'label' => 'Voucher no.', 'type' => 'text'],
            ['key' => 'counterparty', 'label' => 'Received from / issued to', 'type' => 'text'],
            ['key' => 'type', 'label' => 'Entry', 'type' => 'text'],
            ['key' => 'batch', 'label' => 'Batch', 'type' => 'text'],
            ['key' => 'expiry_date', 'label' => 'Expiry', 'type' => 'date'],
            ['key' => 'received', 'label' => 'Received', 'type' => 'number'],
            ['key' => 'issued', 'label' => 'Issued', 'type' => 'number'],
            ['key' => 'loss_adjustment', 'label' => 'Losses / adj.', 'type' => 'number'],
            ['key' => 'balance', 'label' => 'Balance', 'type' => 'number'],
            ['key' => 'by', 'label' => 'By', 'type' => 'text'],
            ['key' => 'comments', 'label' => 'Comments', 'type' => 'text'],
        ];
    }

    public function query(ReportScope $scope, array $filters): Builder
    {
        $query = DB::table('stock_transactions as t')
            ->join('products as p', 'p.id', '=', 't.product_id')
            ->leftJoin('batches as b', 'b.id', '=', 't.batch_id')
            ->leftJoin('users as u', 'u.id', '=', 't.performed_by')
            ->whereIn('t.facility_id', $scope->facilityIds())
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('t.transaction_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->where('t.transaction_date', '<=', $to))
            ->select([
                't.transaction_date', 't.voucher_no', 't.counterparty', 't.transaction_type', 't.quantity', 't.running_balance', 't.count_difference', 't.comments',
                'b.batch_no', 'b.expiry_date', 'p.sku', 'p.name as product_name', 'u.name as performed_by_name',
            ]);

        return $this->filterProducts($query, $filters)->orderBy('t.transaction_date')->orderBy('t.id');
    }

    public function row(object $r): array
    {
        $type = TransactionType::from($r->transaction_type);
        $q = (int) $r->quantity;

        return [
            'date' => substr($r->transaction_date, 0, 10),
            'sku' => $r->sku,
            'product' => $r->product_name,
            'voucher' => $r->voucher_no,
            'counterparty' => $r->counterparty,
            'type' => self::LABELS[$type->value],
            'batch' => $r->batch_no,
            'expiry_date' => $r->expiry_date ? substr($r->expiry_date, 0, 10) : null,
            'received' => in_array($type, [TransactionType::Receipt, TransactionType::TransferIn], true) ? $q : null,
            'issued' => in_array($type, [TransactionType::Issue, TransactionType::TransferOut], true) ? $q : null,
            'loss_adjustment' => match ($type) {
                TransactionType::Loss, TransactionType::AdjustmentOut => -$q,
                TransactionType::AdjustmentIn => $q,
                // Physical inventory: the shortfall (−) or surplus (+) against what was held.
                TransactionType::PhysicalCount => $r->count_difference !== null ? (int) $r->count_difference : null,
                default => null,
            },
            'balance' => (int) $r->running_balance,
            'by' => $r->performed_by_name,
            'comments' => $r->comments,
        ];
    }

    /** One product from a start date: the balance carried forward, as the first line of a new paper card. */
    public function leadingRows(ReportScope $scope, array $filters): array
    {
        if (empty($filters['product_id']) || empty($filters['from'])) {
            return [];
        }
        $before = StockTransaction::query()
            ->where('facility_id', $scope->id)
            ->where('product_id', $filters['product_id'])
            ->where('transaction_date', '<', $filters['from'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->value('running_balance');

        return [[
            'date' => $filters['from'],
            'type' => 'Opening balance',
            'balance' => (int) ($before ?? 0),
        ]];
    }

    private const LABELS = [
        'receipt' => 'Receipt', 'issue' => 'Issue', 'loss' => 'Loss', 'adjustment_in' => 'Adjustment (+)',
        'adjustment_out' => 'Adjustment (−)', 'physical_count' => 'Physical inventory', 'transfer_in' => 'Transfer in',
        'transfer_out' => 'Transfer out',
    ];
}
