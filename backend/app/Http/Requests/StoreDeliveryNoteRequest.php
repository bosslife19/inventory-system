<?php

namespace App\Http\Requests;

use App\Models\DeliveryNote;
use App\Models\Product;
use App\Services\DeliveryNoteService;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Shape validation for POST /facilities/{facility}/delivery-notes. Ledger
 * rules (known batch expiry, back-dating) are checked when the note is
 * confirmed, by StockLedgerService.
 */
class StoreDeliveryNoteRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('create', [DeliveryNote::class, $this->route('facility')]);
    }

    protected function prepareForValidation(): void
    {
        // Same normalization as stock transactions: "al2401a " and "AL2401A" are one batch.
        $items = $this->input('items');
        if (is_array($items)) {
            $this->merge(['items' => array_map(function ($item) {
                if (is_array($item) && is_string($item['batch_no'] ?? null)) {
                    $batch = strtoupper(trim($item['batch_no']));
                    $item['batch_no'] = $batch === '' ? null : $batch;
                }

                return $item;
            }, $items)]);
        }
    }

    public function rules(): array
    {
        return [
            'delivery_note_no' => ['nullable', 'string', 'max:100'],
            /** Supplier or warehouse; becomes the receipts' "Received from". */
            'source' => ['required', 'string', 'max:255'],
            'received_date' => [
                'required', 'date_format:Y-m-d',
                'before_or_equal:'.CarbonImmutable::today(config('app.business_timezone'))->toDateString(),
            ],
            /** "ocr" when the lines were read from a photo on the device and reviewed by staff. */
            'capture_method' => ['nullable', Rule::in(['manual', 'ocr'])],
            'comments' => ['nullable', 'string', 'max:2000'],
            /** Confirm straight away (post the receipts) instead of saving a draft. */
            'confirm' => ['nullable', 'boolean'],
            /** Idempotency key: re-sending it returns the note already created. */
            'client_reference' => ['nullable', 'string', 'max:64'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.batch_no' => ['nullable', 'string', 'max:100'],
            'items.*.expiry_date' => ['nullable', 'date_format:Y-m-d'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $items = $this->input('items');
                if (! is_array($items)) {
                    return;
                }
                $products = Product::whereKey(array_filter(array_column($items, 'product_id'), 'is_int'))->get()->keyBy('id');
                foreach ($items as $i => $item) {
                    $product = $products[$item['product_id'] ?? null] ?? null;
                    if (! $product || $validator->errors()->has("items.{$i}.product_id")) {
                        continue;
                    }
                    $error = DeliveryNoteService::itemBatchErrors($product, $item['batch_no'] ?? null, $item['expiry_date'] ?? null);
                    if ($error) {
                        $validator->errors()->add("items.{$i}.batch_no", 'Line '.($i + 1).": {$error}");
                    }
                }
            },
        ];
    }
}
