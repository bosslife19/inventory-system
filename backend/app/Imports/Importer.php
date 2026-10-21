<?php

namespace App\Imports;

use App\Models\Facility;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Routing\Route;
use Illuminate\Validation\ValidationException;

/**
 * One kind of bulk CSV import. Each row goes through the same form request
 * and service as the matching single-item form, so a row is accepted only
 * if the form would have accepted it. BulkImportService runs the rows.
 */
abstract class Importer
{
    /** Rows per file: enough to onboard an LGA or a store's catalog, small enough for one request. */
    public const MAX_ROWS = 1000;

    /** Needs a facility or store (the one the rows are for), or works on its own. */
    public function forFacility(): bool
    {
        return false;
    }

    /** @return list<ImportColumn> in template order */
    abstract public function columns(): array;

    /** May $user run this import at all (before any row is read)? */
    abstract public function authorize(User $user, ?Facility $facility): Response;

    /**
     * Validate and write one row. Throws ValidationException (keys are CSV
     * column names, or API field names mapped back through columns()) or
     * AuthorizationException when the row is refused.
     *
     * @param  array<string, string|null>  $row
     * @return array{label: string, temporary_password?: string}
     */
    abstract public function import(array $row, User $user, ?Facility $facility): array;

    /** Once the import has committed: refresh anything derived (alerts, status) for what changed. */
    public function afterCommit(?Facility $facility): void {}

    /** @return list<string> */
    public function columnNames(): array
    {
        return array_map(fn (ImportColumn $c) => $c->name, $this->columns());
    }

    /** @return list<string> */
    public function requiredColumns(): array
    {
        return array_values(array_map(fn (ImportColumn $c) => $c->name, array_filter($this->columns(), fn (ImportColumn $c) => $c->required)));
    }

    /** The CSV column an API field came from, for error messages. */
    public function columnFor(string $field): ?string
    {
        foreach ($this->columns() as $column) {
            if ($column->name === $field || $column->field === $field) {
                return $column->name;
            }
        }

        return null;
    }

    /**
     * Run $data through a form request exactly as the matching endpoint
     * would: prepareForValidation, authorize, rules and after() hooks.
     *
     * @template T of FormRequest
     *
     * @param  class-string<T>  $class
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $route  route parameters the request reads, e.g. ['facility' => $facility]
     * @return T validated
     */
    protected function validate(string $class, array $data, User $user, array $route = []): FormRequest
    {
        $request = $class::create('/', 'POST', $data);
        $request->setContainer(app())->setRedirector(app('redirect'));
        $request->setUserResolver(fn () => $user);
        if ($route !== []) {
            $bound = (new Route('POST', '/', fn () => null))->bind($request);
            foreach ($route as $name => $value) {
                $bound->setParameter($name, $value);
            }
            $request->setRouteResolver(fn () => $bound);
        }
        $request->validateResolved();

        return $request;
    }

    /** yes / no / true / false / y / n / 1 / 0 → "1" / "0"; blank → $default; anything else is passed on for the rules to reject. */
    protected static function yesNo(?string $value, ?bool $default = null): ?string
    {
        if ($value === null) {
            return $default === null ? null : ($default ? '1' : '0');
        }

        return match (strtolower($value)) {
            'yes', 'y', 'true', '1' => '1',
            'no', 'n', 'false', '0' => '0',
            default => $value,
        };
    }

    /** "Health center" → health_center, for enum-like cells. */
    protected static function slug(?string $value): ?string
    {
        return $value === null ? null : (str_replace(' ', '_', strtolower(trim(preg_replace('/[\s_-]+/', ' ', $value)))));
    }

    /**
     * Dates as YYYY-MM-DD, or DD/MM/YYYY as Excel saves them on Nigerian
     * settings (day first). Anything else is passed on for the rules to reject.
     */
    protected static function date(?string $value): ?string
    {
        if ($value !== null && preg_match('#^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$#', $value, $m) && checkdate((int) $m[2], (int) $m[1], (int) $m[3])) {
            return CarbonImmutable::create((int) $m[3], (int) $m[2], (int) $m[1])->toDateString();
        }

        return $value;
    }

    /** Numbers as spreadsheets write them: "1,200" → "1200". */
    protected static function number(?string $value): ?string
    {
        return $value === null ? null : str_replace([',', ' '], '', $value);
    }

    protected static function fail(string $column, string $message): never
    {
        throw ValidationException::withMessages([$column => $message]);
    }
}
