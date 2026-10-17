<?php

namespace App\Http\Requests;

use App\Models\Facility;
use App\Models\ReorderRequest;
use App\Services\ReorderRequestService;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** POST /facilities/{facility}/reorder-requests: ask a store above for stock. */
class StoreReorderRequestRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('create', [ReorderRequest::class, $this->route('facility')]);
    }

    public function rules(): array
    {
        return [
            /** A store above this facility (GET /facilities/{facility}/reorder-suppliers). */
            'supplier_facility_id' => ['required', 'integer', Rule::exists('facilities', 'id')],
            'comments' => ['nullable', 'string', 'max:2000'],
            /** Idempotency key: re-sending it returns the request already made. */
            'client_reference' => ['nullable', 'string', 'max:64'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $supplier = Facility::find($this->input('supplier_facility_id'));
                if ($supplier && ! $validator->errors()->has('supplier_facility_id')
                    && ! app(ReorderRequestService::class)->canAsk($this->route('facility'), $supplier)) {
                    $validator->errors()->add('supplier_facility_id', "{$supplier->name} is not a store above this facility.");
                }
            },
        ];
    }
}
