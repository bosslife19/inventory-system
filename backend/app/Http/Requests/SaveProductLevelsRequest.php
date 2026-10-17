<?php

namespace App\Http\Requests;

use App\Data\StockLevels;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

/** PUT /facilities/{facility}/product-levels/{product}: this facility's own min / EOP / max, EOP < min ≤ max. */
class SaveProductLevelsRequest extends FormRequest
{
    public function authorize(): bool
    {
        Gate::authorize('setLevels', $this->route('facility'));

        return true;
    }

    public function rules(): array
    {
        return [
            'min_stock_level' => ['required', 'integer', 'min:0', 'max:10000000'],
            /** This facility's Emergency Order Point: alerts and push notifications fire when usable stock reaches it. */
            'reorder_level' => ['required', 'integer', 'min:0', 'max:10000000'],
            'max_stock_level' => ['required', 'integer', 'min:0', 'max:10000000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->isEmpty()
                    && $error = StockLevels::orderError($this->integer('min_stock_level'), $this->integer('reorder_level'), $this->integer('max_stock_level'))) {
                    $validator->errors()->add(...$error);
                }
            },
        ];
    }
}
