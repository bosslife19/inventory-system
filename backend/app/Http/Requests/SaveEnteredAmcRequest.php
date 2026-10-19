<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** PUT /facilities/{facility}/product-amcs/{product}: the AMC this facility enters while its history is short. */
class SaveEnteredAmcRequest extends FormRequest
{
    public function authorize(): bool
    {
        Gate::authorize('setLevels', $this->route('facility'));

        return true;
    }

    public function rules(): array
    {
        return [
            /** Expected issues per month, in the product's unit. */
            'amc_quantity' => ['required', 'numeric', 'min:0', 'max:10000000'],
        ];
    }
}
