<?php

namespace App\Casts;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A calendar date with no time part, stored as 'Y-m-d'.
 *
 * Eloquent's built-in 'date' cast stores 'Y-m-d 00:00:00', which MySQL's DATE
 * column truncates but SQLite keeps as-is — breaking comparisons like
 * transaction_date <= '2026-06-02'. This keeps storage identical everywhere.
 *
 * @implements CastsAttributes<CarbonImmutable, CarbonImmutable|\DateTimeInterface|string>
 */
class DateOnly implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?CarbonImmutable
    {
        return $value === null ? null : CarbonImmutable::parse(substr((string) $value, 0, 10))->startOfDay();
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : CarbonImmutable::parse($value)->toDateString();
    }
}
