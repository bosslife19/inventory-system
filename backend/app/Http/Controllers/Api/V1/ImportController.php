<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportCsvRequest;
use App\Http\Resources\ImportResultResource;
use App\Imports\ImportColumn;
use App\Imports\Importer;
use App\Models\Facility;
use App\Services\BulkImportService;
use Illuminate\Http\JsonResponse;

/**
 * Bulk CSV imports: products, facilities and accounts on their own; stock
 * levels / starting AMCs and Stock Card entries for one facility or store.
 * Each row passes the same checks as the single-item form. Check first
 * with dry_run=true, then import: all rows or none.
 */
class ImportController extends Controller
{
    public function __construct(private readonly BulkImportService $imports) {}

    /** The columns of an import, for the template and its guide. */
    public function columns(string $kind): JsonResponse
    {
        $importer = $this->imports->importer($kind);

        return response()->json([
            'data' => [
                /** @var 'products'|'facilities'|'users'|'product-levels'|'stock-entries' */
                'kind' => $kind,
                /** Imported through POST /facilities/{facility}/imports/{kind} rather than POST /imports/{kind}. */
                'for_facility' => $importer->forFacility(),
                'max_rows' => Importer::MAX_ROWS,
                /**
                 * In template order. `name` is the header to use; "Product code" also matches product_code.
                 *
                 * @var list<array{name: string, required: bool, description: string, example: string}>
                 */
                'columns' => array_map(fn (ImportColumn $c) => [
                    'name' => $c->name,
                    'required' => $c->required,
                    'description' => $c->description,
                    'example' => $c->example,
                ], $importer->columns()),
            ],
        ]);
    }

    /** Import products, facilities (admin) or accounts. */
    public function store(ImportCsvRequest $request, string $kind): ImportResultResource
    {
        return $this->run($request, $kind, null);
    }

    /** Import stock levels / starting AMCs, or Stock Card entries, for this facility or store. */
    public function storeForFacility(ImportCsvRequest $request, Facility $facility, string $kind): ImportResultResource
    {
        return $this->run($request, $kind, $facility);
    }

    private function run(ImportCsvRequest $request, string $kind, ?Facility $facility): ImportResultResource
    {
        $importer = $this->imports->importer($kind);
        $user = $request->user();
        $importer->authorize($user, $facility)->authorize();

        $dryRun = $request->boolean('dry_run');
        $result = $this->imports->run($importer, $request->file('file')->getRealPath(), $user, $facility, $dryRun);

        return ImportResultResource::make([...$result, 'kind' => $kind, 'dry_run' => $dryRun]);
    }
}
