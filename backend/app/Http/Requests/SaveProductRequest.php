<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Product;
use App\Models\StockTransaction;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * POST /products and PUT /products/{product} (admin). On update every field
 * is optional. Thresholds must read min ≤ reorder (EOP) ≤ max, like the
 * paper Bin Card; batch tracking can't be switched once the product has a
 * Stock Card entry anywhere, or old and new rows would disagree.
 */
class SaveProductRequest extends FormRequest
{
    public function authorize(): Response
    {
        return $this->user()->role === UserRole::Admin
            ? Response::allow()
            : Response::deny('Only admins manage the product catalog.');
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('sku'))) {
            $this->merge(['sku' => strtoupper(trim($this->input('sku')))]);
        }
    }

    public function rules(): array
    {
        $required = $this->product() ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:255'],
            /** Short product code, unique; upper-cased. Printed on delivery notes, so scanning matches on it. */
            'sku' => [$required, 'string', 'max:50', Rule::unique('products', 'sku')->ignore($this->product())],
            'category' => [$required, 'string', 'max:100'],
            /** e.g. pack, sachet, ampoule, box. */
            'unit_of_measure' => [$required, 'string', 'max:50'],
            'requires_batch_tracking' => [$required, 'boolean'],
            'requires_cold_chain' => [$required, 'boolean'],
            'min_stock_level' => [$required, 'integer', 'min:0', 'max:10000000'],
            'max_stock_level' => [$required, 'integer', 'min:0', 'max:10000000'],
            /** The Emergency Order Point (EOP). */
            'reorder_level' => [$required, 'integer', 'min:0', 'max:10000000'],
            /** false retires it: hidden from entry forms, history kept. */
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                $product = $this->product();
                $level = fn (string $k) => (int) ($this->input($k) ?? $product?->{$k});
                if ($level('min_stock_level') > $level('reorder_level')) {
                    $validator->errors()->add('reorder_level', 'The reorder level (EOP) can’t be below the minimum level.');
                }
                if ($level('reorder_level') > $level('max_stock_level')) {
                    $validator->errors()->add('max_stock_level', 'The maximum level can’t be below the reorder level (EOP).');
                }
                if ($product && $this->has('requires_batch_tracking')
                    && $this->boolean('requires_batch_tracking') !== $product->requires_batch_tracking
                    && StockTransaction::where('product_id', $product->id)->exists()) {
                    $validator->errors()->add('requires_batch_tracking', 'This product already has Stock Card entries, so batch tracking can’t be switched.');
                }
            },
        ];
    }

    public function product(): ?Product
    {
        return $this->route('product');
    }
}
