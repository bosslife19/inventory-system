<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TransactionType;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockTransactionRequest;
use App\Http\Resources\StockTransactionCollection;
use App\Http\Resources\StockTransactionResource;
use App\Models\Facility;
use App\Models\StockTransaction;
use App\Services\StockLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StockTransactionController extends Controller
{
    /**
     * Ledger history (the Stock Card) for a facility, paginated.
     * With product_id and order=asc it reads exactly like the paper card.
     */
    public function index(Request $request, Facility $facility): StockTransactionCollection
    {
        Gate::authorize('viewAny', [StockTransaction::class, $facility]);

        $filters = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'transaction_type' => ['nullable', Rule::enum(TransactionType::class)],
            /** Inclusive, YYYY-MM-DD. */
            'from' => ['nullable', 'date_format:Y-m-d'],
            /** Inclusive, YYYY-MM-DD. */
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            /** Default desc (newest first). */
            'order' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $order = $filters['order'] ?? 'desc';

        $transactions = $facility->stockTransactions()
            ->with(['batch', 'product', 'performer'])
            ->when($filters['product_id'] ?? null, fn ($q, $id) => $q->where('product_id', $id))
            ->when($filters['transaction_type'] ?? null, fn ($q, $type) => $q->where('transaction_type', $type))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('transaction_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->where('transaction_date', '<=', $to))
            ->orderBy('transaction_date', $order)
            ->orderBy('id', $order)
            ->paginate($filters['per_page'] ?? 50);

        return new StockTransactionCollection($transactions);
    }

    /**
     * Record a Stock Card entry. Authorization (StockTransactionPolicy@create)
     * runs in StoreStockTransactionRequest::authorize(), before validation.
     */
    public function store(StoreStockTransactionRequest $request, Facility $facility, StockLedgerService $ledger): JsonResponse
    {
        $transaction = $ledger->record(
            facility: $facility,
            product: $request->product(),
            type: $request->transactionType(),
            quantity: $request->integer('quantity'),
            transactionDate: $request->transactionDate(),
            performedBy: $request->user(),
            batchNo: $request->input('batch_no'),
            expiryDate: $request->input('expiry_date'),
            voucherNo: $request->input('voucher_no'),
            counterparty: $request->input('counterparty'),
            comments: $request->input('comments'),
        );

        return StockTransactionResource::make($transaction->load(['product', 'performer']))
            ->response()
            ->setStatusCode(201);
    }
}
