<?php

use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\Product;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-05 10:00:00');
    $this->h = hierarchyFixture();
    $this->f = $this->h['facilities'];
    $this->u = $this->h['users'];
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack', 'pack_size' => 24,
        'requires_batch_tracking' => true, 'min_stock_level' => 30, 'max_stock_level' => 60, 'reorder_level' => 20,
    ]);
    $r = fn (Facility $f, Product $p, TransactionType $type, int $qty, string $date, ?string $batch = null) => app(StockLedgerService::class)->record(
        facility: $f, product: $p, type: $type, quantity: $qty, transactionDate: CarbonImmutable::parse($date),
        performedBy: $this->u['admin'], batchNo: $batch, expiryDate: $batch ? '2027-12-31' : null,
        counterparty: $type->requiresCounterparty() ? 'CMS' : null,
    );

    // Sheet2's example row: opening 3 (August's count), +50, −31, −2 losses, counted 20.
    $r($this->f['kawo'], $this->ors, TransactionType::Receipt, 3, '2026-08-20');
    $r($this->f['kawo'], $this->ors, TransactionType::PhysicalCount, 3, '2026-08-31');
    $r($this->f['kawo'], $this->ors, TransactionType::Receipt, 50, '2026-09-05');
    $r($this->f['kawo'], $this->ors, TransactionType::Issue, 31, '2026-09-10');
    $r($this->f['kawo'], $this->ors, TransactionType::Loss, 2, '2026-09-15');
    $r($this->f['kawo'], $this->ors, TransactionType::PhysicalCount, 20, '2026-09-30');

    // New this month, and the count finds 2 fewer than the card says.
    $r($this->f['kawo'], $this->al, TransactionType::Receipt, 40, '2026-09-01', 'AL1');
    $r($this->f['kawo'], $this->al, TransactionType::Issue, 10, '2026-09-12', 'AL1');
    $r($this->f['kawo'], $this->al, TransactionType::PhysicalCount, 28, '2026-09-30', 'AL1');

    // Never counted.
    $r($this->f['rimi'], $this->ors, TransactionType::Receipt, 5, '2026-09-15');
});

function movement(array $query): array
{
    return test()->getJson('/api/v1/reports/stock-movement?'.http_build_query($query))->assertOk()->json('data');
}

it('reproduces the template’s month-end sheet for a facility', function () {
    $this->actingAs($this->u['sdp'], 'sanctum');
    $rows = collect(movement(['area' => 'facility', 'id' => $this->f['kawo']->id, 'period' => '2026-09'])['rows'])->keyBy('sku');

    expect($rows['ORS'])->toMatchArray([
        'opening' => 3, 'opening_from' => 'Physical inventory 2026-08-31',
        'received' => 50, 'used' => 31, 'loss_adjustment' => -2, 'closing' => 20,
        'physical' => 20, 'difference' => 0,
        'amc' => 31.0, 'to_order' => 155, 'required' => 135, // AMC × 5 months, minus what was counted
    ])->and($rows['AL'])->toMatchArray([
        'opening' => 0, 'opening_from' => 'New this period',
        'received' => 40, 'used' => 10, 'closing' => 30, 'physical' => 28, 'difference' => -2,
        'amc' => 10.0, 'to_order' => 50, 'required' => 22,
        'comments' => 'Physical inventory differs from closing stock',
    ]);
});

it('carries the period-end count forward as the next opening stock', function () {
    $this->actingAs($this->u['sdp'], 'sanctum');
    $rows = collect(movement(['area' => 'facility', 'id' => $this->f['kawo']->id, 'period' => '2026-10'])['rows'])->keyBy('sku');

    expect($rows['AL'])->toMatchArray(['opening' => 28, 'opening_from' => 'Physical inventory 2026-09-30', 'received' => 0, 'closing' => 28, 'physical' => null]);
});

it('covers a quarter, and an area’s SDPs with the uncounted flagged', function () {
    $this->actingAs($this->u['lga'], 'sanctum');
    $data = movement(['area' => 'lga', 'id' => $this->h['lgas']['kadunaNorth']->id, 'period' => '2026-Q3', 'product_id' => $this->ors->id]);

    expect(array_map(fn ($r) => [$r['facility'], $r['opening'], $r['received'], $r['closing'], $r['physical']], $data['rows']))->toBe([
        ['Kawo PHC', 0, 53, 20, 20],
        ['Rimi PHC', 0, 5, 5, null],
    ])->and($data['rows'][1]['comments'])->toContain('No physical inventory at the end of the period');
});

it('needs a period, and keeps to what the caller can see', function () {
    $this->actingAs($this->u['sdp'], 'sanctum')
        ->getJson('/api/v1/reports/stock-movement?area=facility&id='.$this->f['kawo']->id.'&period=2026-13')
        ->assertUnprocessable()->assertJsonValidationErrors('period');
    $this->getJson('/api/v1/reports/stock-movement?area=facility&id='.$this->f['rimi']->id.'&period=2026-09')->assertForbidden();
});
