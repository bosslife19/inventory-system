<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\User;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** POST /users — a new account on a temporary password. */
class StoreUserRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('create', User::class);
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => strtolower(trim($this->input('email')))]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['required', Rule::enum(UserRole::class)],
            /** Required for sdp_staff: the facility (SDP) they work at. */
            'facility_id' => ['nullable', 'integer'],
            /** Required for lga_officer. */
            'lga_id' => ['nullable', 'integer'],
            /** Required for state_officer. */
            'state_id' => ['nullable', 'integer'],
            /** Leave out to have one generated. Either way it must be changed at first sign-in. */
            'temporary_password' => ['nullable', 'string', 'min:8', 'max:100'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $role = UserRole::tryFrom((string) $this->input('role'));
                if (! $role || $validator->errors()->has('role')) {
                    return;
                }
                $column = $role->nodeColumn();
                $scope = HierarchyScope::for($this->user());
                $error = $scope->assignmentError($role, $column ? $this->integer($column) ?: null : null);
                if ($error) {
                    $validator->errors()->add(in_array($role, $scope->manageableRoles(), true) ? ($column ?? 'role') : 'role', $error);
                }
            },
        ];
    }
}
