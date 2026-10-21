<?php

namespace App\Imports;

use App\Enums\TransactionType;
use App\Http\Requests\StoreStockTransactionRequest;
use App\Models\Facility;
use App\Models\StockTransaction;
use App\Models\User;
use App\Services\StockLedgerService;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Stock Card entries for one facility or store, as POST
 * /facilities/{id}/stock-transactions — e.g. the opening physical inventory
 * of a facility that is starting on the system, or a backlog of paper
 * Stock Card rows. Recorded top to bottom through the ledger, so the same
 * rules apply: no back-dating before a product's last entry, no issuing
 * more than is on hand, batch numbers for batch-tracked products.
 */
class StockEntryImporter extends Importer
{
    private const TYPES = [
        'physical_inventory' => 'physical_count',
        'inventory' => 'physical_count',
        'count' => 'physical_count',
        'opening_balance' => 'physical_count',
        'received' => 'receipt',
        'issued' => 'issue',
    ];

    /** @var array<int, true> products with new entries, refreshed after commit */
    private array $changed = [];

    public function __construct(private readonly StockLedgerService $ledger) {}

    public function forFacility(): bool
    {
        return true;
    }

    public function columns(): array
    {
        return [
            new ImportColumn('product_code', true, 'Code of an active product in the catalog.', 'AMX250', 'product_id'),
            new ImportColumn('type', true, 'physical_inventory (sets the balance to the count), receipt, issue, loss, adjustment_in, adjustment_out, transfer_in or transfer_out.', 'physical_inventory', 'transaction_type'),
            new ImportColumn('quantity', true, 'In the product’s unit. For physical_inventory, the quantity counted.', '120'),
            new ImportColumn('date', true, 'YYYY-MM-DD or DD/MM/YYYY, not in the future. Rows are recorded top to bottom, so keep each product’s rows in date order.', '2026-10-01', 'transaction_date'),
            new ImportColumn('batch_no', false, 'Required for batch-tracked products; leave blank for others.', 'AL2401A'),
            new ImportColumn('expiry_date', false, 'The batch’s expiry, YYYY-MM-DD or DD/MM/YYYY.', '2027-06-30'),
            new ImportColumn('received_from_or_issued_to', false, 'Required for receipt, issue and transfers.', 'Kaduna State Store', 'counterparty'),
            new ImportColumn('voucher_no', false, 'Voucher or delivery note number.', 'SIV-0042'),
            new ImportColumn('comments', false, 'Anything else.', 'Opening balance'),
        ];
    }

    public function authorize(User $user, ?Facility $facility): Response
    {
        return Gate::forUser($user)->inspect('create', [StockTransaction::class, $facility]);
    }

    public function import(array $row, User $user, ?Facility $facility): array
    {
        $product = ProductLevelImporter::findProduct($row['product_code']);
        if (! $product->is_active) {
            self::fail('product_code', "{$product->sku} is retired, so it can’t take new entries.");
        }
        $type = self::slug($row['type']);

        $request = $this->validate(StoreStockTransactionRequest::class, [
            'product_id' => $product->id,
            'transaction_type' => self::TYPES[$type] ?? $type,
            'quantity' => self::number($row['quantity']),
            'transaction_date' => self::date($row['date']),
            'batch_no' => $row['batch_no'] ?? null,
            'expiry_date' => self::date($row['expiry_date'] ?? null),
            'counterparty' => $row['received_from_or_issued_to'] ?? null,
            'voucher_no' => $row['voucher_no'] ?? null,
            'comments' => $row['comments'] ?? null,
        ], $user, ['facility' => $facility]);

        $entry = $this->ledger->record(
            facility: $facility,
            product: $product,
            type: $request->transactionType(),
            quantity: $request->integer('quantity'),
            transactionDate: $request->transactionDate(),
            performedBy: $user,
            batchNo: $request->input('batch_no'),
            expiryDate: $request->input('expiry_date'),
            voucherNo: $request->input('voucher_no'),
            counterparty: $request->input('counterparty'),
            comments: $request->input('comments'),
            deferDerived: true,
        );
        $this->changed[$product->id] = true;

        $batch = $entry->batch ? " batch {$entry->batch->batch_no}" : '';
        $kind = $entry->transaction_type === TransactionType::PhysicalCount ? 'physical inventory' : str_replace('_', ' ', $entry->transaction_type->value);

        return ['label' => "{$product->sku}{$batch}: {$kind} {$entry->quantity}, balance {$entry->running_balance}"];
    }

    public function afterCommit(?Facility $facility): void
    {
        foreach (array_keys($this->changed) as $productId) {
            $this->ledger->refreshDerived($facility, $productId);
        }
    }
}
