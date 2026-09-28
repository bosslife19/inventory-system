<?php

namespace App\Services;

use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Recording activity: how many Stock Card entries were made per week.
 *
 * Counts entries rather than summing quantities — quantities across products
 * are in different units (packs, sachets, ampoules) and don't add up.
 */
class StockActivityService
{
    /**
     * @param  list<int>|Builder<Facility>  $facilityIds  ids, or a subquery selecting them (large rollups)
     * @return array{
     *     weeks: list<array{week_start: string, received: int, issued: int, other: int}>,
     *     totals: array{received: int, issued: int, other: int},
     *     last_transaction_date: string|null
     * }
     */
    public function weekly(array|Builder $facilityIds, int $weekCount): array
    {
        $today = CarbonImmutable::today(config('app.business_timezone'));
        $firstWeek = $today->startOfWeek(CarbonImmutable::MONDAY)->subWeeks($weekCount - 1);

        $weeks = [];
        for ($i = 0; $i < $weekCount; $i++) {
            $weeks[$firstWeek->addWeeks($i)->toDateString()] = ['received' => 0, 'issued' => 0, 'other' => 0];
        }

        $rows = StockTransaction::query()
            ->whereIn('facility_id', $facilityIds)
            ->where('transaction_date', '>=', $firstWeek->toDateString())
            ->selectRaw('transaction_date, transaction_type, count(*) as entries')
            ->groupBy('transaction_date', 'transaction_type')
            ->toBase()
            ->get();

        foreach ($rows as $row) {
            $week = CarbonImmutable::parse($row->transaction_date)->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
            if (! isset($weeks[$week])) {
                continue;
            }

            $type = TransactionType::from($row->transaction_type);
            $bucket = match ($type) {
                TransactionType::Receipt, TransactionType::TransferIn => 'received',
                TransactionType::Issue, TransactionType::TransferOut => 'issued',
                default => 'other', // losses, adjustments, physical counts
            };
            $weeks[$week][$bucket] += (int) $row->entries;
        }

        $list = [];
        foreach ($weeks as $weekStart => $counts) {
            $list[] = ['week_start' => $weekStart, ...$counts];
        }

        $lastDate = StockTransaction::whereIn('facility_id', $facilityIds)->max('transaction_date');

        return [
            'weeks' => $list,
            'totals' => [
                'received' => array_sum(array_column($list, 'received')),
                'issued' => array_sum(array_column($list, 'issued')),
                'other' => array_sum(array_column($list, 'other')),
            ],
            'last_transaction_date' => $lastDate ? substr($lastDate, 0, 10) : null,
        ];
    }
}
