<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\Facility;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /facilities and PUT /facilities/{facility} (admin). SDPs only — the
 * LGA / State / National stores are created with their node and aren't
 * edited here. A facility stays in its LGA: its Stock Card history and
 * rollups belong there, so moving one means a new facility.
 */
class SaveFacilityRequest extends FormRequest
{
    public const TYPES = ['health_center', 'hospital', 'pharmacy', 'warehouse', 'other'];

    public function authorize(): Response
    {
        if ($this->user()->role !== UserRole::Admin) {
            return Response::deny('Only admins manage facilities.');
        }

        return $this->facility()?->isStore()
            ? Response::deny('Stores are created with their LGA, state or the nation and can’t be edited here.')
            : Response::allow();
    }

    public function rules(): array
    {
        $facility = $this->facility();
        $required = $facility ? 'sometimes' : 'required';
        $lgaId = $facility?->lga_id ?? $this->integer('lga_id');

        return [
            /** Create only: the LGA it sits in. */
            'lga_id' => $facility ? ['prohibited'] : ['required', 'integer', Rule::exists('lgas', 'id')],
            'name' => [$required, 'string', 'max:255',
                Rule::unique('facilities', 'name')->where('lga_id', $lgaId)->ignore($facility)],
            'type' => [$required, Rule::in(self::TYPES)],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'phone' => ['nullable', 'string', 'max:30'],
            /** false closes it: no new Stock Card entries, history kept. */
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique' => 'There is already a facility with this name in that LGA.',
            'lga_id.prohibited' => 'A facility can’t move to another LGA.',
        ];
    }

    public function facility(): ?Facility
    {
        return $this->route('facility');
    }
}
