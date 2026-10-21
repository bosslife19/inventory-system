<?php

namespace App\Imports;

/** One column of an import template, as the column guide describes it. */
final class ImportColumn
{
    public function __construct(
        /** Header in the CSV (snake_case; "Product code" also matches product_code). */
        public readonly string $name,
        public readonly bool $required,
        public readonly string $description,
        public readonly string $example,
        /** The API field it fills, when that differs from the column name (for error messages). */
        public readonly ?string $field = null,
    ) {}
}
