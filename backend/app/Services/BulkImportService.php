<?php

namespace App\Services;

use App\Imports\FacilityImporter;
use App\Imports\Importer;
use App\Imports\ProductImporter;
use App\Imports\ProductLevelImporter;
use App\Imports\StockEntryImporter;
use App\Imports\UserImporter;
use App\Models\Facility;
use App\Models\User;
use App\Support\CsvTable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Bulk CSV imports. All or nothing: every row is written inside one
 * transaction, and if any row is refused — or this is a check (dry run) —
 * the whole file is rolled back, so a file is never half imported. Running
 * the rows for real even in a check means within-file clashes (the same
 * code twice, issuing stock a row above received) are caught too.
 */
class BulkImportService
{
    /** Kind (as in the URL) => importer. */
    public const KINDS = [
        'products' => ProductImporter::class,
        'facilities' => FacilityImporter::class,
        'users' => UserImporter::class,
        'product-levels' => ProductLevelImporter::class,
        'stock-entries' => StockEntryImporter::class,
    ];

    public function importer(string $kind): Importer
    {
        return app(self::KINDS[$kind]);
    }

    /**
     * @return array{committed: bool, rows: list<array{row: int, ok: bool, label: string|null, errors: list<array{column: string|null, message: string}>, temporary_password?: string}>}
     */
    public function run(Importer $importer, string $path, User $user, ?Facility $facility, bool $dryRun): array
    {
        $rows = CsvTable::read($path, $importer->columnNames(), $importer->requiredColumns(), Importer::MAX_ROWS);

        $results = [];
        $failed = false;
        DB::beginTransaction();
        try {
            foreach ($rows as $line => $row) {
                try {
                    // A savepoint per row, so a refused row leaves nothing behind for the rows after it.
                    $out = DB::transaction(fn () => $importer->import($row, $user, $facility));
                    $results[] = ['row' => $line, 'ok' => true, 'label' => $out['label'], 'errors' => [],
                        ...(isset($out['temporary_password']) ? ['temporary_password' => $out['temporary_password']] : [])];
                } catch (ValidationException $e) {
                    $failed = true;
                    $results[] = ['row' => $line, 'ok' => false, 'label' => null, 'errors' => $this->rowErrors($importer, $e)];
                } catch (AuthorizationException $e) {
                    $failed = true;
                    $results[] = ['row' => $line, 'ok' => false, 'label' => null, 'errors' => [['column' => null, 'message' => $e->getMessage()]]];
                }
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $commit = ! $dryRun && ! $failed;
        if ($commit) {
            DB::commit();
            $importer->afterCommit($facility);
        } else {
            DB::rollBack();
            // Nothing was created, so no password is real.
            $results = array_map(fn ($r) => array_diff_key($r, ['temporary_password' => true]), $results);
        }

        return ['committed' => $commit, 'rows' => $results];
    }

    /** @return list<array{column: string|null, message: string}> */
    private function rowErrors(Importer $importer, ValidationException $e): array
    {
        $errors = [];
        foreach ($e->errors() as $field => $messages) {
            foreach ($messages as $message) {
                $errors[] = ['column' => $importer->columnFor($field), 'message' => $message];
            }
        }

        return $errors;
    }
}
