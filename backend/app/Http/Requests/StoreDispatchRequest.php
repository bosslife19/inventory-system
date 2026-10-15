<?php

namespace App\Http\Requests;

use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Models\Product;
use App\Services\DeliveryNoteService;
use App\Services\DispatchService;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Shape validation for POST /facilities/{facility}/dispatches. Ledger rules
 * (enough stock, known and unexpired batch, no back-dating) are checked by
 * StockLedgerService as each line is issued.
 */
class StoreDispatchRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('dispatch', [DeliveryNote::class, $this->route('facility')]);
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
            /** A facility one level down the chain (GET /facilities/{facility}/dispatch-destinations). */
            'destination_facility_id' => ['required', 'integer', Rule::exists('facilities', 'id')],
            /** Issue voucher / waybill number; DSP-000123 is generated when omitted. */
            'voucher_no' => ['nullable', 'string', 'max:100'],
            'dispatched_date' => [
                'required', 'date_format:Y-m-d',
                'before_or_equal:'.CarbonImmutable::today(config('app.business_timezone'))->toDateString(),
            ],
            'comments' => ['nullable', 'string', 'max:2000'],
            /** Idempotency key: re-sending it returns the dispatch already made. */
            'client_reference' => ['nullable', 'string', 'max:64'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            /** Required for batch-tracked products; must be a batch the store holds. */
            'items.*.batch_no' => ['nullable', 'string', 'max:100'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $to = Facility::find($this->input('destination_facility_id'));
                if ($to && ! $validator->errors()->has('destination_facility_id')
                    && ! app(DispatchService::class)->canDispatchTo($this->route('facility'), $to)) {
                    $validator->errors()->add('destination_facility_id', "{$to->name} is not one level below this store.");
                }

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
                    $error = DeliveryNoteService::itemBatchErrors($product, $item['batch_no'] ?? null, null);
                    if ($error) {
                        $validator->errors()->add("items.{$i}.batch_no", 'Line '.($i + 1).": {$error}");
                    }
                }
            },
        ];
    }

    public function destination(): Facility
    {
        return Facility::findOrFail($this->integer('destination_facility_id'));
    }
}
