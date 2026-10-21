<?php

namespace App\Http\Requests;

use App\Enums\Plan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /owner/organizations and PUT /owner/organizations/{organization}
 * (the platform owner only — EnsureOwner). On update every field is
 * optional. Creating may also make the organization's first admin account.
 */
class SaveOrganizationRequest extends FormRequest
{
    public function rules(): array
    {
        $required = $this->route('organization') ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:255'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_email' => ['nullable', 'string', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:500'],
            'plan' => [$required, Rule::enum(Plan::class)],
            /** Last day of the paid plan (Y-m-d); leave empty for no end date. */
            'paid_until' => ['nullable', 'date_format:Y-m-d'],
            /** Suspending signs every member out and stops them signing in. Nothing is deleted. */
            'is_active' => ['sometimes', 'boolean'],
            /** Your own notes (what they paid, invoice numbers); never shown to the organization. */
            'notes' => ['nullable', 'string', 'max:5000'],
            /** Create only: the organization's first admin, on a temporary password returned once. */
            'admin' => [$this->route('organization') ? 'prohibited' : 'nullable', 'array'],
            'admin.name' => ['required_with:admin', 'string', 'max:255'],
            'admin.email' => ['required_with:admin', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
        ];
    }
}
