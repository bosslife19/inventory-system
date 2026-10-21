<?php

use App\Enums\TransactionType;
use App\Models\AmcSnapshot;
use App\Models\Product;
use App\Services\ReorderService;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->kawo = $this->h['facilities']['kawo'];

    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 30, 'max_stock_level' => 60, 'reorder_level' => 20,
    ]);

    $ledger = app(StockLedgerService::class);
    $admin = $this->h['users']['admin'];
    $rec = fn ($product, TransactionType $type, int $qty, string $date, ?string $batch = null, ?string $expiry = null) => $ledger->record(
        $this->kawo, $product, $type, $qty, CarbonImmutable::parse($date), $admin,
        batchNo: $batch, expiryDate: $expiry, counterparty: 'OPD',
    );

    // ORS first appears mid-June, so June is left out: AMC over July + August.
    $rec($this->ors, TransactionType::Receipt, 300, '2026-06-10');
    $rec($this->ors, TransactionType::Issue, 20, '2026-06-20'); // partial month: ignored
    $rec($this->ors, TransactionType::Issue, 60, '2026-07-15');
    $rec($this->ors, TransactionType::Issue, 30, '2026-08-03');
    $rec($this->ors, TransactionType::Loss, 10, '2026-08-10'); // not consumption
    $rec($this->ors, TransactionType::Issue, 30, '2026-08-20');
    $rec($this->ors, TransactionType::Issue, 45, '2026-09-05'); // current month: ignored
    // Usable ORS now: 300 - 20 - 60 - 30 - 10 - 30 - 45 = 105

    // AL only this month: no complete month of history.
    $rec($this->al, TransactionType::Receipt, 40, '2026-09-02', 'B1', '2027-12-31');
});

it('averages issues over complete months the product was on the card', function () {
    $amc = app(ReorderService::class)->amc($this->kawo, CarbonImmutable::parse('2026-09-01'));

    expect($amc[$this->ors->id])->toBe(['amc' => 60.0, 'months' => 2])
        ->and($amc)->not->toHaveKey($this->al->id); // no entries before the period
});

it('writes a monthly snapshot, overwriting on re-run, and skips once the month is done', function () {
    $this->artisan('stock:compute-amc')
        ->expectsOutputToContain('AMC for 2026-09: 4 facilities, 2 product rows.')
        ->assertSuccessful();

    $ors = AmcSnapshot::where('product_id', $this->ors->id)->sole();
    expect($ors->period_month->toDateString())->toBe('2026-09-01')
        ->and($ors->amc_quantity)->toBe(60.0)
        ->and($ors->months_used)->toBe(2)
        ->and($ors->months_of_stock)->toBe(1.8) // 105 / 60
        ->and($ors->suggested_reorder_quantity)->toBe(195); // 60 x 5 - 105

    $this->artisan('stock:compute-amc')->expectsOutputToContain('already computed for 2026-09')->assertSuccessful();
    $this->artisan('stock:compute-amc --force')->assertSuccessful();
    expect(AmcSnapshot::count())->toBe(2);
});

it('suggests quantities from the latest AMC against live stock, falling back to max level', function () {
    $this->artisan('stock:compute-amc')->assertSuccessful();

    // Stock moves after the snapshot: suggestions use current usable stock.
    app(StockLedgerService::class)->record(
        $this->kawo, $this->ors, TransactionType::Issue, 15, CarbonImmutable::parse('2026-09-20'), $this->h['users']['admin'], counterparty: 'OPD',
    );

    $data = $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suggestions")
        ->assertOk()
        ->json('data');

    expect(array_column(array_column($data, 'product'), 'sku'))->toBe(['ORS', 'AL'])
        ->and($data[0])->toMatchArray([
            'usable_quantity' => 90,
            'amc_quantity' => 60,
            'amc_months_used' => 2,
            'amc_period_month' => '2026-09-01',
            'months_of_stock' => 1.5,
            'max_stock_quantity' => 300, // 60 x 5 months
            'basis' => 'amc',
            'suggested_quantity' => 210,
        ])
        ->and($data[1])->toMatchArray([
            'usable_quantity' => 40,
            'amc_quantity' => null,
            'months_of_stock' => null,
            'max_stock_quantity' => 60,
            'basis' => 'product_max',
            'suggested_quantity' => 20,
        ]);
});

it('uses an AMC the facility entered until it has a full window of its own history', function () {
    $this->artisan('stock:compute-amc')->assertSuccessful();
    $sdp = $this->h['users']['sdp'];

    // AL has no history; ORS has 2 of the 3 months.
    $this->actingAs($sdp, 'sanctum')->putJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->al->id}", ['amc_quantity' => 25])
        ->assertOk()
        ->assertJsonPath('data.entered_amc', 25)
        ->assertJsonPath('data.source', 'catalog');
    $this->putJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->ors->id}", ['amc_quantity' => 50])->assertOk();

    $data = collect($this->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suggestions")->assertOk()->json('data'))
        ->keyBy('product.sku');
    expect($data['AL'])->toMatchArray([
        'amc_quantity' => 25, 'amc_source' => 'entered', 'basis' => 'amc',
        'max_stock_quantity' => 125, 'suggested_quantity' => 85, // 25 x 5 - 40
    ])->and($data['ORS'])->toMatchArray(['amc_quantity' => 50, 'amc_source' => 'entered', 'suggested_quantity' => 145]); // 250 - 105

    $report = collect($this->getJson('/api/v1/reports/reorder?area=facility&id='.$this->kawo->id)->assertOk()->json('data.rows'))->keyBy('sku');
    expect($report['AL'])->toMatchArray(['amc' => 25, 'basis' => 'Entered AMC', 'to_order' => 85]);

    // A full window of history: the computed AMC takes over.
    AmcSnapshot::where('product_id', $this->ors->id)->update(['months_used' => 3]);
    expect(collect($this->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suggestions")->json('data'))->firstWhere('product.sku', 'ORS'))
        ->toMatchArray(['amc_quantity' => 60, 'amc_source' => 'computed']);

    // Cleared: back to the product's max level.
    $this->deleteJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->al->id}")->assertNoContent();
    expect(collect($this->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suggestions")->json('data'))->firstWhere('product.sku', 'AL'))
        ->toMatchArray(['amc_quantity' => null, 'amc_source' => null, 'basis' => 'product_max']);
});

it('lets only whoever keeps the Stock Card enter an AMC', function () {
    $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->al->id}", ['amc_quantity' => 25])
        ->assertForbidden();
    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->al->id}", ['amc_quantity' => -1])
        ->assertUnprocessable()->assertJsonValidationErrors('amc_quantity');
});

it('keeps reorder suggestions within the caller scope', function () {
    $rimi = $this->h['facilities']['rimi'];

    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$rimi->id}/reorder-suggestions")
        ->assertForbidden();

    $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suggestions")
        ->assertOk()
        ->assertJsonCount(2, 'data');
});
