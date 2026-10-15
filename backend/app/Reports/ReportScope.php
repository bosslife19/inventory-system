<?php

namespace App\Reports;

use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Support\HierarchyScope;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Query\JoinClause;

/**
 * Which facilities a report covers: one facility (SDP or store), or the SDPs
 * of an LGA, a state or the whole country — always within what the caller
 * can see (HierarchyScope), like the dashboards. Area reports count SDPs
 * only; a store's own report is area=facility with the store's id.
 */
final class ReportScope
{
    private function __construct(
        public readonly string $area,
        public readonly ?int $id,
        public readonly string $name,
        /** @var Builder<Facility> */
        private readonly Builder $facilities,
    ) {}

    /** @throws AuthorizationException when the caller can't see that node */
    public static function resolve(HierarchyScope $scope, string $area, ?int $id): self
    {
        $sdps = fn () => $scope->scopeFacilities(Facility::query()->servicePoints());

        return match ($area) {
            'facility' => (function () use ($scope, $id) {
                $facility = Facility::findOrFail($id);
                self::allow($scope->canViewFacility($facility));

                return new self('facility', $facility->id, $facility->name, Facility::query()->whereKey($facility->id));
            })(),
            'lga' => (function () use ($scope, $id, $sdps) {
                $lga = Lga::with('state')->findOrFail($id);
                self::allow($scope->canViewLga($lga));

                return new self('lga', $lga->id, "{$lga->name} LGA, {$lga->state->name} State", $sdps()->where('facilities.lga_id', $lga->id));
            })(),
            'state' => (function () use ($scope, $id, $sdps) {
                $state = State::findOrFail($id);
                self::allow($scope->canViewState($state));

                return new self('state', $state->id, "{$state->name} State", $sdps()->whereIn('facilities.lga_id', Lga::select('id')->where('state_id', $state->id)));
            })(),
            'national' => (function () use ($scope, $sdps) {
                self::allow($scope->isNational());

                return new self('national', null, 'Nigeria', $sdps());
            })(),
        };
    }

    private static function allow(bool $allowed): void
    {
        if (! $allowed) {
            throw new AuthorizationException('That area is outside what you can see.');
        }
    }

    /** Subquery of the covered facility ids, for whereIn. */
    public function facilityIds(): QueryBuilder
    {
        return (clone $this->facilities)->select('facilities.id')->toBase();
    }

    /**
     * Join facilities (alias f), their LGA (l) and state (s) onto a query
     * whose facility id column is $facilityColumn, selecting the place names.
     */
    public static function joinPlace(QueryBuilder $query, string $facilityColumn): QueryBuilder
    {
        return $query
            ->join('facilities as f', 'f.id', '=', $facilityColumn)
            ->leftJoin('lgas as l', 'l.id', '=', 'f.lga_id')
            ->leftJoin('states as s', fn (JoinClause $j) => $j->on('s.id', '=', 'f.state_id')->orOn('s.id', '=', 'l.state_id'))
            ->addSelect(['f.name as facility_name', 'l.name as lga_name', 's.name as state_name']);
    }
}
