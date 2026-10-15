<?php

namespace App\Reports;

use Illuminate\Database\Query\Builder;

/**
 * One report: its columns, filters and row query. ReportController turns it
 * into JSON (on screen / print) or a streamed CSV, so a report only says
 * what it contains. Display-only, like every read of the ledger: nothing
 * here is written back.
 */
abstract class Report
{
    abstract public function title(): string;

    /** Extra query filters beyond area / id / product_id / category / format / limit. */
    public function rules(): array
    {
        return [];
    }

    /** Reports that only make sense for one facility (the Stock Card). */
    public function facilityOnly(): bool
    {
        return false;
    }

    /**
     * @return list<array{key: string, label: string, type: 'text'|'number'|'date'}>
     */
    abstract public function columns(ReportScope $scope): array;

    /**
     * Rows in report order; each one goes through row().
     *
     * @param  array<string, mixed>  $filters  validated query
     */
    abstract public function query(ReportScope $scope, array $filters): Builder;

    /**
     * @return array<string, string|int|float|null> keyed by column key
     */
    abstract public function row(object $r): array;

    /**
     * Drop a mapped row — for filters on computed values (e.g. quantity to order).
     *
     * @param  array<string, string|int|float|null>  $row
     * @param  array<string, mixed>  $filters
     */
    public function keep(array $row, array $filters): bool
    {
        return true;
    }

    /**
     * Rows to put before the queried ones (e.g. a Stock Card's opening balance).
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, string|int|float|null>>
     */
    public function leadingRows(ReportScope $scope, array $filters): array
    {
        return [];
    }

    /** State / LGA / facility columns, for reports covering more than one facility. */
    protected function placeColumns(ReportScope $scope): array
    {
        return $scope->area === 'facility' ? [] : [
            ['key' => 'state', 'label' => 'State', 'type' => 'text'],
            ['key' => 'lga', 'label' => 'LGA', 'type' => 'text'],
            ['key' => 'facility', 'label' => 'Facility', 'type' => 'text'],
        ];
    }

    /** @return array{state: string|null, lga: string|null, facility: string} */
    protected function place(object $r): array
    {
        return ['state' => $r->state_name, 'lga' => $r->lga_name, 'facility' => $r->facility_name];
    }

    /** Product filters shared by every report (p = products alias). */
    protected function filterProducts(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['product_id'] ?? null, fn ($q, $id) => $q->where('p.id', $id))
            ->when($filters['category'] ?? null, fn ($q, $c) => $q->where('p.category', $c));
    }
}
