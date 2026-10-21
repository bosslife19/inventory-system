<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /imports/{kind} and POST /facilities/{facility}/imports/{kind}: a CSV file, checked or imported. */
class ImportCsvRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        // Multipart forms carry booleans as "true"/"false", which Laravel's boolean rule rejects.
        if ($this->has('dry_run')) {
            $this->merge(['dry_run' => filter_var($this->input('dry_run'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $this->input('dry_run')]);
        }
    }

    public function rules(): array
    {
        return [
            /** The CSV, header row first (GET /imports/{kind} lists the columns). Up to 1000 rows, 2 MB. */
            'file' => ['required', 'file', 'max:2048', 'extensions:csv,txt'],
            /** true: check every row and report, writing nothing. Default false: import, all or nothing. */
            'dry_run' => ['sometimes', 'boolean'],
        ];
    }
}
