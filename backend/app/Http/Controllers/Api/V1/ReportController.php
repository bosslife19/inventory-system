<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Reports\ExpiryReport;
use App\Reports\ReorderReport;
use App\Reports\Report;
use App\Reports\ReportScope;
use App\Reports\StockCardReport;
use App\Reports\StockStatusReport;
use App\Support\HierarchyScope;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Reports (docs/API_CONTRACT.md, "Reports"): one facility, or the SDPs of an
 * LGA / state / the country, within what the caller can see. JSON (capped at
 * `limit` rows) for the screen and print view; format=csv streams every row
 * for a spreadsheet.
 */
class ReportController extends Controller
{
    private const REPORTS = [
        'stock-card' => StockCardReport::class,
        'stock-status' => StockStatusReport::class,
        'reorder' => ReorderReport::class,
        'expiry' => ExpiryReport::class,
    ];

    /**
     * Run a report.
     *
     * @param  'stock-card'|'stock-status'|'reorder'|'expiry'  $report
     */
    public function show(Request $request, string $report, HierarchyScope $hierarchy): JsonResponse|StreamedResponse
    {
        /** @var Report $definition */
        $definition = app(self::REPORTS[$report] ?? abort(404));

        if ($request->has('needs_order')) {
            $request->merge(['needs_order' => filter_var($request->query('needs_order'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $request->query('needs_order')]);
        }
        $filters = $request->validate([
            /** facility (an SDP or a store), lga, state or national (SDPs only for areas). */
            'area' => ['required', Rule::in(['facility', 'lga', 'state', 'national'])],
            /** The facility / LGA / state id; omit for national. */
            'id' => ['required_unless:area,national', 'nullable', 'integer'],
            'product_id' => ['nullable', 'integer'],
            'category' => ['nullable', 'string', 'max:100'],
            /** json (default) or csv. */
            'format' => ['nullable', Rule::in(['json', 'csv'])],
            /** JSON only: at most this many rows (default 2000, max 5000); CSV has every row. */
            'limit' => ['nullable', 'integer', 'min:1', 'max:5000'],
            ...$definition->rules(),
        ]);

        if ($definition->facilityOnly() && $filters['area'] !== 'facility') {
            throw ValidationException::withMessages(['area' => "The {$definition->title()} report is for one facility."]);
        }

        $scope = ReportScope::resolve($hierarchy, $filters['area'], isset($filters['id']) ? (int) $filters['id'] : null);
        $columns = $definition->columns($scope);
        $rows = function () use ($definition, $scope, $filters) {
            yield from $definition->leadingRows($scope, $filters);
            foreach ($definition->query($scope, $filters)->lazy(1000) as $r) {
                $row = $definition->row($r);
                if ($definition->keep($row, $filters)) {
                    yield $row;
                }
            }
        };

        if (($filters['format'] ?? 'json') === 'csv') {
            return $this->csv($report, $scope, $columns, $rows());
        }

        $limit = (int) ($filters['limit'] ?? 2000);
        $list = [];
        $truncated = false;
        foreach ($rows() as $row) {
            if (count($list) === $limit) {
                $truncated = true;
                break;
            }
            $list[] = $row;
        }

        return response()->json([
            'data' => [
                'report' => $report,
                'title' => $definition->title(),
                /** @var array{area: 'facility'|'lga'|'state'|'national', id: int|null, name: string} */
                'scope' => ['area' => $scope->area, 'id' => $scope->id, 'name' => $scope->name],
                'generated_at' => CarbonImmutable::now(config('app.business_timezone'))->toIso8601String(),
                /** @var list<array{key: string, label: string, type: 'text'|'number'|'date'}> */
                'columns' => $columns,
                /** @var list<array<string, string|int|float|null>> */
                'rows' => $list,
                /** True when there were more than `limit` rows: download the CSV for all of them. */
                'truncated' => $truncated,
            ],
        ]);
    }

    /**
     * @param  list<array{key: string, label: string, type: string}>  $columns
     * @param  iterable<array<string, mixed>>  $rows
     */
    private function csv(string $report, ReportScope $scope, array $columns, iterable $rows): StreamedResponse
    {
        $filename = sprintf('%s-%s-%s.csv', $report, Str::slug($scope->name), CarbonImmutable::today(config('app.business_timezone'))->toDateString());

        return response()->streamDownload(function () use ($columns, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM, so Excel reads UTF-8 (₦, –, names) correctly
            fputcsv($out, array_column($columns, 'label'));
            foreach ($rows as $row) {
                fputcsv($out, array_map(fn ($c) => $row[$c['key']] ?? '', $columns));
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
