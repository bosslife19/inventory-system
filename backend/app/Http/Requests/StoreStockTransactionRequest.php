<?php

namespace App\Http\Requests;

use App\Enums\TransactionType;
use App\Models\Product;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Shape validation for POST /facilities/{facility}/stock-transactions.
 * State-dependent checks (unknown batch, insufficient stock, back-dating)
 * live in StockLedgerService and also come back as 422s.
 */
class StoreStockTransactionRequest extends FormRequest
{
    public function authorize(): Response
    {
        // Runs before validation, so unauthorized callers learn nothing about products/batches.
        // inspect() (not can()) keeps the policy's deny message in the 403.
        return Gate::forUser($this->user())->inspect('create', [StockTransaction::class, $this->route('facility')]);
    }

    protected function prepareForValidation(): void
    {
        // Batch numbers are copied by hand from packaging; normalize so
        // "al2401a " and "AL2401A" are the same batch.
        if (is_string($this->batch_no)) {
            $batchNo = strtoupper(trim($this->batch_no));
            $this->merge(['batch_no' => $batchNo === '' ? null : $batchNo]);
        }
    }

    public function rules(): array
    {
        $type = TransactionType::tryFrom((string) $this->input('transaction_type'));

        return [
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'transaction_type' => ['required', Rule::enum(TransactionType::class)],
            'quantity' => [
                'required', 'integer', 'max:10000000',
                $type === TransactionType::PhysicalCount ? 'min:0' : 'min:1',
            ],
            'batch_no' => ['nullable', 'string', 'max:100'],
            'expiry_date' => ['nullable', 'date_format:Y-m-d'],
            'voucher_no' => ['nullable', 'string', 'max:50'],
            'counterparty' => [
                Rule::requiredIf($type?->requiresCounterparty() ?? false),
                'nullable', 'string', 'max:255',
            ],
            'comments' => ['nullable', 'string', 'max:2000'],
            /** Idempotency key (e.g. a UUID from an offline outbox). Re-sending it returns the entry already recorded. */
            'client_reference' => ['nullable', 'string', 'max:64'],
            'transaction_date' => [
                'required', 'date_format:Y-m-d',
                'before_or_equal:'.CarbonImmutable::today(config('app.business_timezone'))->toDateString(),
            ],
        ];
    }

    /** backend/CLAUDE.md rule 2: batch requirements are enforced at the validation layer. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->has('product_id')) {
                    return;
                }

                $product = $this->product();

                if ($product->requires_batch_tracking && $this->input('batch_no') === null) {
                    $validator->errors()->add('batch_no', "batch_no is required for {$product->name}.");
                }

                if (! $product->requires_batch_tracking) {
                    foreach (['batch_no', 'expiry_date'] as $field) {
                        if ($this->filled($field)) {
                            $validator->errors()->add($field, "{$product->name} is not batch-tracked; omit {$field}.");
                        }
                    }
                }
            },
        ];
    }

    public function product(): Product
    {
        return Product::findOrFail($this->integer('product_id'));
    }

    public function transactionType(): TransactionType
    {
        return TransactionType::from($this->input('transaction_type'));
    }

    public function transactionDate(): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $this->input('transaction_date'));
    }
}
