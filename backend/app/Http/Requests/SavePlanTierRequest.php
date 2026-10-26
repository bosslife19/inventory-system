<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /owner/plan-tiers and PUT /owner/plan-tiers/{planTier} (the platform
 * owner only — EnsureOwner). On update every field is optional. A new price
 * applies to checkouts from now on, never to payments already made.
 */
class SavePlanTierRequest extends FormRequest
{
    public function rules(): array
    {
        $required = $this->route('planTier') ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            /** Whole naira a month. */
            'monthly_price' => [$required, 'integer', 'min:100', 'max:100000000'],
            /** Open facilities (SDPs); empty = no limit. */
            'max_facilities' => ['nullable', 'integer', 'min:1'],
            /** Active accounts, every role together; empty = no limit. */
            'max_accounts' => ['nullable', 'integer', 'min:1'],
            /** False withdraws it from sale; organizations on it keep it until it lapses. */
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
