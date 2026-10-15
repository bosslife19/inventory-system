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

/** PUT /users/{user} — any subset of the fields; role and node are checked together. */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::forUser($this->user())->inspect('update', $this->target());
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
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->target())],
            'role' => ['sometimes', 'required', Rule::enum(UserRole::class)],
            'facility_id' => ['nullable', 'integer'],
            'lga_id' => ['nullable', 'integer'],
            'state_id' => ['nullable', 'integer'],
            /** false deactivates the account and signs it out everywhere; true reactivates it. */
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $touchesAnchor = $this->hasAny(['role', 'facility_id', 'lga_id', 'state_id']);
                if (! $touchesAnchor || $validator->errors()->has('role')) {
                    return;
                }
                $target = $this->target();
                $role = $this->has('role') ? UserRole::from($this->input('role')) : $target->role;
                $column = $role->nodeColumn();
                $node = $column ? ($this->has($column) ? $this->integer($column) : $target->{$column}) : null;
                $scope = HierarchyScope::for($this->user());
                $error = $scope->assignmentError($role, $node ?: null);
                if ($error) {
                    $validator->errors()->add(in_array($role, $scope->manageableRoles(), true) ? ($column ?? 'role') : 'role', $error);
                }
            },
        ];
    }

    public function target(): User
    {
        return $this->route('user');
    }
}
