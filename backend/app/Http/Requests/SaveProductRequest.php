<?php

namespace App\Http\Requests;

use App\Data\StockLevels;
use App\Enums\UnitOfMeasure;
use App\Enums\UserRole;
use App\Models\Product;
use App\Models\StockTransaction;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * POST /products (anyone signed in — every level may add products) and
 * PUT /products/{product} (admins, or whoever added it). On update every
 * field is optional. The catalog levels must read EOP < min ≤ max; each
 * facility may then set its own (PUT /facilities/{id}/product-levels/{product}).
 * Container units (pack, box, carton…) say how many pieces each holds.
 * Batch tracking can't be switched once the product has a Stock Card entry
 * anywhere, or old and new rows would disagree.
 */
class SaveProductRequest extends FormRequest
{
    public function authorize(): Response
    {
        $product = $this->product();
        if ($product === null || $this->user()->role === UserRole::Admin || $product->created_by === $this->user()->id) {
            return Response::allow();
        }

        return Response::deny('Only admins, or whoever added this product, can change it.');
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('sku'))) {
            $this->merge(['sku' => strtoupper(trim($this->input('sku')))]);
        }
        if (is_string($this->input('unit_of_measure'))) {
            $this->merge(['unit_of_measure' => strtolower(trim($this->input('unit_of_measure')))]);
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
            /** What one counts as on the Stock Card. */
            'unit_of_measure' => [$required, Rule::enum(UnitOfMeasure::class)],
            /** Pieces in each pack / box / carton / bag / kit — required for those units, optional otherwise. */
            'pack_size' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'requires_batch_tracking' => [$required, 'boolean'],
            'requires_cold_chain' => [$required, 'boolean'],
            'min_stock_level' => [$required, 'integer', 'min:0', 'max:10000000'],
            'max_stock_level' => [$required, 'integer', 'min:0', 'max:10000000'],
            /** The Emergency Order Point (EOP): below the minimum; alerts fire when usable stock reaches it. */
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
                $value = fn (string $k) => $this->has($k) ? $this->input($k) : $product?->{$k};

                if ($error = StockLevels::orderError((int) $value('min_stock_level'), (int) $value('reorder_level'), (int) $value('max_stock_level'))) {
                    $validator->errors()->add(...$error);
                }

                $unit = $value('unit_of_measure');
                $unit = $unit instanceof UnitOfMeasure ? $unit : UnitOfMeasure::from($unit);
                if ($unit->isContainer() && ! $value('pack_size')) {
                    $validator->errors()->add('pack_size', "Say how many pieces are in each {$unit->value}.");
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
