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
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
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
        ->and($ors->suggested_reorder_quantity)->toBe(75); // 60 x 3 - 105

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
            'max_stock_quantity' => 180,
            'basis' => 'amc',
            'suggested_quantity' => 90,
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
