<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Payment;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** POST /billing/checkout (the organization's admins). */
class CheckoutRequest extends FormRequest
{
    public function authorize(): Response
    {
        return $this->user()->role === UserRole::Admin
            ? Response::allow()
            : Response::deny('Only your organization’s admins pay for its plan.');
    }

    public function rules(): array
    {
        return [
            /** A tier on offer (GET /billing/plans). */
            'plan_tier_id' => ['required', 'integer', Rule::exists('plan_tiers', 'id')->where('is_active', true)],
            /**
             * How many months to pay for.
             *
             * @var 1|3|6|12
             */
            'months' => ['required', 'integer', Rule::in(Payment::MONTHS)],
        ];
    }

    public function messages(): array
    {
        return ['plan_tier_id.exists' => 'That plan isn’t on offer any more.'];
    }
}
