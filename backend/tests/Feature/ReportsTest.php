<?php

use App\Enums\TransactionType;
use App\Models\AmcSnapshot;
use App\Models\Facility;
use App\Models\Product;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->f = $this->h['facilities'];
    $this->u = $this->h['users'];
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 30, 'max_stock_level' => 60, 'reorder_level' => 20,
    ]);
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->record = fn (Facility $f, Product $p, TransactionType $type, int $qty, string $date, ?string $batch = null, ?string $expiry = null) => app(StockLedgerService::class)->record(
        facility: $f, product: $p, type: $type, quantity: $qty, transactionDate: CarbonImmutable::parse($date),
        performedBy: $this->u['admin'], batchNo: $batch, expiryDate: $expiry,
        counterparty: $type->requiresCounterparty() ? 'CMS' : null,
    );

    $r = $this->record;
    $r($this->f['kawo'], $this->al, TransactionType::Receipt, 50, '2026-09-01', 'AL1', '2026-10-20'); // expiring soon
    $r($this->f['kawo'], $this->al, TransactionType::Issue, 10, '2026-09-10', 'AL1');
    $r($this->f['kawo'], $this->ors, TransactionType::Receipt, 80, '2026-09-12');
    $r($this->f['kawo'], $this->al, TransactionType::Issue, 15, '2026-09-20', 'AL1');
    $r($this->f['rimi'], $this->ors, TransactionType::Receipt, 5, '2026-09-15'); // low stock
    $r($this->f['tudun'], $this->al, TransactionType::Receipt, 30, '2026-09-15', 'AL0', '2026-09-20'); // expired, in Zaria
    $r(Facility::storeForLga($this->h['lgas']['kadunaNorth']), $this->ors, TransactionType::Receipt, 500, '2026-09-15');
});

function reportUrl(string $name, array $query): string
{
    return "/api/v1/reports/{$name}?".http_build_query($query);
}

it('reports stock status for an area, SDPs only, worst detail per row', function () {
    $lga = $this->h['lgas']['kadunaNorth'];
    $data = $this->actingAs($this->u['lga'], 'sanctum')
        ->getJson(reportUrl('stock-status', ['area' => 'lga', 'id' => $lga->id]))
        ->assertOk()
        ->assertJsonPath('data.scope.name', 'Kaduna North LGA, Kaduna State')
        ->assertJsonPath('data.truncated', false)
        ->json('data');

    expect(array_column($data['columns'], 'key'))->toContain('facility', 'usable', 'level')
        ->and(array_map(fn ($r) => [$r['facility'], $r['sku'], $r['usable'], $r['level']], $data['rows']))->toBe([
            ['Kawo PHC', 'AL', 25, 'Below min'],
            ['Kawo PHC', 'ORS', 80, 'OK'],
            ['Rimi PHC', 'ORS', 5, 'At / below EOP'],
        ]);

    // One facility (here the LGA's own store): no place columns.
    $store = Facility::storeForLga($lga);
    $one = $this->getJson(reportUrl('stock-status', ['area' => 'facility', 'id' => $store->id]))->assertOk()->json('data');
    expect(array_column($one['columns'], 'key'))->not->toContain('facility')
        ->and($one['rows'][0]['on_hand'])->toBe(500);

    $this->getJson(reportUrl('stock-status', ['area' => 'lga', 'id' => $lga->id, 'level' => 'low_stock']))
        ->assertJsonCount(1, 'data.rows')->assertJsonPath('data.rows.0.facility', 'Rimi PHC');
});

it('keeps reports inside what the caller can see', function () {
    $this->actingAs($this->u['lga'], 'sanctum');
    $this->getJson(reportUrl('stock-status', ['area' => 'state', 'id' => $this->h['states']['kaduna']->id]))->assertForbidden();
    $this->getJson(reportUrl('stock-status', ['area' => 'lga', 'id' => $this->h['lgas']['zaria']->id]))->assertForbidden();
    $this->getJson(reportUrl('stock-status', ['area' => 'national']))->assertForbidden();

    $this->actingAs($this->u['sdp'], 'sanctum');
    $this->getJson(reportUrl('expiry', ['area' => 'facility', 'id' => $this->f['kawo']->id]))->assertOk();
    $this->getJson(reportUrl('expiry', ['area' => 'facility', 'id' => $this->f['rimi']->id]))->assertForbidden();

    $this->actingAs($this->u['federal'], 'sanctum');
    $national = $this->getJson(reportUrl('stock-status', ['area' => 'national']))->assertOk()->json('data.rows');
    expect(collect($national)->pluck('facility')->unique()->values()->all())->toBe(['Kawo PHC', 'Rimi PHC', 'Tudun Wada PHC']);
});

it('prints a Stock Card in card order, with the balance carried forward', function () {
    $this->actingAs($this->u['sdp'], 'sanctum');
    $rows = $this->getJson(reportUrl('stock-card', [
        'area' => 'facility', 'id' => $this->f['kawo']->id, 'product_id' => $this->al->id, 'from' => '2026-09-05',
    ]))->assertOk()->assertJsonPath('data.title', 'Stock Card')->json('data.rows');

    expect(array_map(fn ($r) => [$r['date'], $r['type'], $r['issued'] ?? null, $r['balance']], $rows))->toBe([
        ['2026-09-05', 'Opening balance', null, 50],
        ['2026-09-10', 'Issue', 10, 40],
        ['2026-09-20', 'Issue', 15, 25],
    ])->and($rows[1]['batch'])->toBe('AL1');

    $this->getJson(reportUrl('stock-card', ['area' => 'lga', 'id' => $this->h['lgas']['kadunaNorth']->id]))
        ->assertUnprocessable()->assertJsonValidationErrors('area');
});

it('shows the shortfall or surplus a physical inventory finds in the losses / adjustments column', function () {
    $r = $this->record;
    $r($this->f['kawo'], $this->al, TransactionType::PhysicalCount, 22, '2026-09-21', 'AL1');
    $r($this->f['kawo'], $this->ors, TransactionType::PhysicalCount, 85, '2026-09-21');

    $rows = $this->actingAs($this->u['sdp'], 'sanctum')
        ->getJson(reportUrl('stock-card', ['area' => 'facility', 'id' => $this->f['kawo']->id, 'from' => '2026-09-21']))
        ->assertOk()->json('data.rows');

    expect(array_map(fn ($r) => [$r['sku'], $r['type'], $r['loss_adjustment'], $r['balance']], $rows))->toBe([
        ['AL', 'Physical inventory', -3, 22],
        ['ORS', 'Physical inventory', 5, 85],
    ]);
});

it('lists expired and soon-expiring batches, earliest first', function () {
    $this->actingAs($this->u['state'], 'sanctum');
    $state = $this->h['states']['kaduna']->id;

    $rows = $this->getJson(reportUrl('expiry', ['area' => 'state', 'id' => $state]))->assertOk()->json('data.rows');
    expect(array_map(fn ($r) => [$r['facility'], $r['batch'], $r['status'], $r['days_left'], $r['quantity']], $rows))->toBe([
        ['Tudun Wada PHC', 'AL0', 'Expired', -6, 30],
        ['Kawo PHC', 'AL1', 'Expiring soon', 24, 25],
    ]);

    $this->getJson(reportUrl('expiry', ['area' => 'state', 'id' => $state, 'within_days' => 7]))
        ->assertJsonCount(1, 'data.rows')->assertJsonPath('data.rows.0.status', 'Expired');
});

it('works out quantities to order from the latest AMC', function () {
    AmcSnapshot::create([
        'facility_id' => $this->f['kawo']->id, 'product_id' => $this->al->id, 'period_month' => '2026-08-01',
        'amc_quantity' => 5, 'months_used' => 1, 'suggested_reorder_quantity' => 0, 'created_at' => now(),
    ]);
    AmcSnapshot::create([
        'facility_id' => $this->f['kawo']->id, 'product_id' => $this->al->id, 'period_month' => '2026-09-01',
        'amc_quantity' => 20, 'months_used' => 2, 'suggested_reorder_quantity' => 0, 'created_at' => now(),
    ]);

    $this->actingAs($this->u['lga'], 'sanctum');
    $rows = collect($this->getJson(reportUrl('reorder', ['area' => 'lga', 'id' => $this->h['lgas']['kadunaNorth']->id]))->assertOk()->json('data.rows'));
    $al = $rows->firstWhere('sku', 'AL');
    // max = ceil(20 × 5 months) = 100; usable 25 → order 75; 25 / 20 = 1.3 months.
    expect($al)->toMatchArray(['amc' => 20, 'months_of_stock' => 1.3, 'max_stock' => 100, 'to_order' => 75, 'basis' => 'Consumption (AMC)'])
        ->and($rows->firstWhere('facility', 'Rimi PHC'))->toMatchArray(['amc' => null, 'max_stock' => 100, 'to_order' => 95]);

    $needing = $this->getJson(reportUrl('reorder', ['area' => 'lga', 'id' => $this->h['lgas']['kadunaNorth']->id, 'needs_order' => 'true']))->json('data.rows');
    expect(collect($needing)->pluck('to_order')->every(fn ($q) => $q > 0))->toBeTrue()
        ->and(collect($needing)->pluck('sku', 'facility')->all())->not->toHaveKey('Kawo PHC.ORS');
});

it('streams every row as CSV, and caps JSON with a truncated flag', function () {
    $this->actingAs($this->u['federal'], 'sanctum');

    $json = $this->getJson(reportUrl('stock-status', ['area' => 'national', 'limit' => 2]))->json('data');
    expect($json['rows'])->toHaveCount(2)->and($json['truncated'])->toBeTrue();

    $res = $this->get(reportUrl('stock-status', ['area' => 'national', 'format' => 'csv', 'limit' => 2]))->assertOk();
    expect($res->headers->get('content-type'))->toContain('text/csv')
        ->and($res->headers->get('content-disposition'))->toContain('stock-status-nigeria-2026-09-26.csv');

    $lines = array_values(array_filter(explode("\n", $res->streamedContent())));
    expect($lines[0])->toStartWith("\xEF\xBB\xBFState,LGA,Facility,SKU,Product")
        ->and($lines)->toHaveCount(1 + 4); // header + 4 rows (Kawo ×2, Rimi, Tudun)
});
