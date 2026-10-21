<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What a bulk import (or its check) did, row by row. The resource is
 * BulkImportService::run()'s result plus `kind` and `dry_run`.
 */
class ImportResultResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var list<array{row: int, ok: bool, label: string|null, errors: list<array{column: string|null, message: string}>, temporary_password?: string}> $rows */
        $rows = $this->resource['rows'];
        $failed = count(array_filter($rows, fn ($r) => ! $r['ok']));

        return [
            /** @var 'products'|'facilities'|'users'|'product-levels'|'stock-entries' */
            'kind' => $this->resource['kind'],
            'dry_run' => (bool) $this->resource['dry_run'],
            /** true when the rows were written; false after a check, or when any row was refused (then nothing was written). */
            'committed' => (bool) $this->resource['committed'],
            'total_rows' => count($rows),
            'failed_rows' => $failed,
            /**
             * One per data row, in file order. `row` is the line number in the file (the header is line 1).
             * `temporary_password` only on an accounts import that committed: shown once, never again.
             *
             * @var list<array{row: int, ok: bool, label: string|null, errors: list<array{column: string|null, message: string}>, temporary_password?: string}>
             */
            'rows' => $rows,
        ];
    }
}
