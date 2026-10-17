<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Services\DeliveryNoteService;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * POST /reorder-requests/{reorderRequest}/fulfil: what the store actually
 * sends — a dispatch to the requester. Ledger rules (enough stock, known
 * unexpired batch, no back-dating) are checked as each line is issued.
 */
class FulfilReorderRequestRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('respond', $this->route('reorderRequest'));
    }

    protected function prepareForValidation(): void
    {
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
            'dispatched_date' => [
                'required', 'date_format:Y-m-d',
                'before_or_equal:'.CarbonImmutable::today(config('app.business_timezone'))->toDateString(),
            ],
            /** Issue voucher / waybill number; DSP-000123 is generated when omitted. */
            'voucher_no' => ['nullable', 'string', 'max:100'],
            'comments' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            /** Required for batch-tracked products; a batch the store holds. */
            'items.*.batch_no' => ['nullable', 'string', 'max:100'],
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
                    if ($product && ! $validator->errors()->has("items.{$i}.product_id")
                        && $error = DeliveryNoteService::itemBatchErrors($product, $item['batch_no'] ?? null, null)) {
                        $validator->errors()->add("items.{$i}.batch_no", 'Line '.($i + 1).": {$error}");
                    }
                }
            },
        ];
    }
}
