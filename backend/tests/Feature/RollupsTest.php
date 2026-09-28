<?php

use App\Enums\TransactionType;
use App\Models\FacilityProductStatus;
use App\Models\Product;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    ['kawo' => $kawo, 'rimi' => $rimi, 'tudun' => $tudun, 'ikejaGh' => $ikeja] = $this->h['facilities'];

    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
    ]);
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);

    $ledger = app(StockLedgerService::class);
    $admin = $this->h['users']['admin'];
    $this->rec = fn ($facility, $product, TransactionType $type, int $qty, string $date, ?string $batch = null, ?string $expiry = null) => $ledger->record($facility, $product, $type, $qty, CarbonImmutable::parse($date), $admin, batchNo: $batch, expiryDate: $expiry, counterparty: 'CMS');

    // Kaduna > Kaduna North
    //   Kawo: AL 10 expired + 25 expiring soon (usable 25: reorder); ORS 80 ok
    ($this->rec)($kawo, $this->al, TransactionType::Receipt, 10, '2026-06-01', 'OLD', '2026-09-01');
    ($this->rec)($kawo, $this->al, TransactionType::Receipt, 25, '2026-06-02', 'NEW', '2026-10-26');
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 80, '2026-06-01');
    //   Rimi: AL 5 expiring soon (low); ORS stocked out
    ($this->rec)($rimi, $this->al, TransactionType::Receipt, 5, '2026-06-01', 'NEW', '2026-10-26');
    ($this->rec)($rimi, $this->ors, TransactionType::Receipt, 20, '2026-06-01');
    ($this->rec)($rimi, $this->ors, TransactionType::Issue, 20, '2026-06-05');
    // Kaduna > Zaria — Tudun: ORS 5 (low)
    ($this->rec)($tudun, $this->ors, TransactionType::Receipt, 5, '2026-06-03');
    // Lagos > Ikeja — Ikeja GH: ORS 90 ok
    ($this->rec)($ikeja, $this->ors, TransactionType::Receipt, 90, '2026-06-04');
});

it('rolls a state up by LGA, worst first, counting each facility once per flag', function () {
    $kaduna = $this->h['states']['kaduna'];

    $data = $this->actingAs($this->h['users']['state'], 'sanctum')
        ->getJson("/api/v1/states/{$kaduna->id}/stock-summary")
        ->assertOk()
        ->json('data');

    expect($data['node'])->toBe(['level' => 'state', 'id' => $kaduna->id, 'name' => 'Kaduna', 'parent' => ['level' => 'country', 'id' => null, 'name' => 'Nigeria']])
        ->and($data['child_count'])->toBe(2)
        ->and($data['facility_count'])->toBe(3)
        ->and($data['facility_counts'])->toBe(['stock_out' => 1, 'expired' => 1, 'low_stock' => 2, 'expiring_soon' => 2])
        ->and($data['facility_status'])->toBe(['stock_out' => 1, 'low_stock' => 1, 'reorder' => 1, 'ok' => 0, 'no_data' => 0])
        ->and(array_column($data['children'], 'name'))->toBe(['Kaduna North', 'Zaria'])
        ->and($data['children'][0])->toMatchArray([
            'level' => 'lga',
            'facility_count' => 2,
            'reporting_facility_count' => 2,
            'flag_counts' => ['stock_out' => 1, 'expired' => 1, 'low_stock' => 1, 'expiring_soon' => 2],
            'needs_reorder_count' => 2,
            'last_transaction_date' => '2026-06-05',
            'stock_out_products' => [['product' => ['id' => $this->ors->id, 'name' => 'ORS', 'sku' => 'ORS'], 'facility_count' => 1]],
        ])
        ->and($data['children'][1]['flag_counts'])->toBe(['stock_out' => 0, 'expired' => 0, 'low_stock' => 1, 'expiring_soon' => 0]);

    $products = collect($data['products'])->keyBy('product.sku');
    expect($products['AL'])->toMatchArray([
        'quantity_on_hand' => 40, 'usable_quantity' => 30, 'expired_quantity' => 10,
        'facility_counts' => ['stock_out' => 0, 'expired' => 1, 'low_stock' => 1, 'expiring_soon' => 2],
        'facilities_needing_reorder' => 2,
    ])
        ->and($products['ORS'])->toMatchArray(['usable_quantity' => 85, 'facilities_needing_reorder' => 2]);
});

it('rolls the country up by state for national users only', function () {
    $this->actingAs($this->h['users']['state'], 'sanctum')->getJson('/api/v1/federal/stock-summary')->assertForbidden();
    $this->actingAs($this->h['users']['lga'], 'sanctum')->getJson('/api/v1/federal/stock-summary')->assertForbidden();

    $data = $this->actingAs($this->h['users']['federal'], 'sanctum')
        ->getJson('/api/v1/federal/stock-summary')
        ->assertOk()
        ->json('data');

    expect($data['node']['level'])->toBe('country')
        ->and($data['facility_count'])->toBe(4)
        ->and($data['facility_status'])->toBe(['stock_out' => 1, 'low_stock' => 1, 'reorder' => 1, 'ok' => 1, 'no_data' => 0])
        ->and(array_column($data['children'], 'name'))->toBe(['Kaduna', 'Lagos'])
        ->and($data['children'][0])->toMatchArray(['level' => 'state', 'geopolitical_zone' => 'north_west', 'facility_count' => 3])
        ->and($data['children'][1]['flag_counts'])->toBe(['stock_out' => 0, 'expired' => 0, 'low_stock' => 0, 'expiring_soon' => 0]);
});

it('never shows a state rollup above or sideways of the caller', function () {
    ['kaduna' => $kaduna, 'lagos' => $lagos] = $this->h['states'];

    $this->actingAs($this->h['users']['state'], 'sanctum')->getJson("/api/v1/states/{$lagos->id}/stock-summary")->assertForbidden();
    $this->actingAs($this->h['users']['lga'], 'sanctum')->getJson("/api/v1/states/{$kaduna->id}/stock-summary")->assertForbidden();
    $this->actingAs($this->h['users']['sdp'], 'sanctum')->getJson("/api/v1/states/{$kaduna->id}/stock-activity")->assertForbidden();
    $this->actingAs($this->h['users']['admin'], 'sanctum')->getJson("/api/v1/states/{$lagos->id}/stock-summary")->assertOk();
});

it('reflects a ledger write immediately and can be rebuilt by the daily pass', function () {
    $ikeja = $this->h['facilities']['ikejaGh'];
    ($this->rec)($ikeja, $this->ors, TransactionType::Issue, 90, '2026-09-20');

    $this->actingAs($this->h['users']['federal'], 'sanctum');
    $lagos = fn () => collect($this->getJson('/api/v1/federal/stock-summary')->json('data.children'))->firstWhere('name', 'Lagos');
    expect($lagos()['flag_counts']['stock_out'])->toBe(1);

    $before = $this->getJson('/api/v1/federal/stock-summary')->json('data');
    FacilityProductStatus::query()->delete();
    expect($this->getJson('/api/v1/federal/stock-summary')->json('data.facility_status.no_data'))->toBe(4);

    $this->artisan('stock:refresh-status')->assertSuccessful();
    expect($this->getJson('/api/v1/federal/stock-summary')->json('data'))->toEqual($before);
});

it('matches the live LGA rollup for the same facilities', function () {
    $lga = $this->h['lgas']['kadunaNorth'];
    $this->actingAs($this->h['users']['state'], 'sanctum');

    $live = $this->getJson("/api/v1/lgas/{$lga->id}/stock-summary")->assertOk()->json('data');
    $fromState = collect($this->getJson("/api/v1/states/{$this->h['states']['kaduna']->id}/stock-summary")->json('data.children'))
        ->firstWhere('id', $lga->id);

    expect($live['facility_count'])->toBe($fromState['facility_count'])
        ->and($live['facility_counts'])->toBe($fromState['flag_counts'])
        ->and($live['facility_status'])->toBe(['stock_out' => 1, 'low_stock' => 0, 'reorder' => 1, 'ok' => 0, 'no_data' => 0]);
});

it('counts weekly activity for a state and nationally', function () {
    $this->actingAs($this->h['users']['federal'], 'sanctum');

    $this->getJson("/api/v1/states/{$this->h['states']['kaduna']->id}/stock-activity?weeks=26")
        ->assertOk()
        ->assertJsonPath('data.totals', ['received' => 6, 'issued' => 1, 'other' => 0]);

    $this->getJson('/api/v1/federal/stock-activity?weeks=26')
        ->assertOk()
        ->assertJsonPath('data.totals', ['received' => 7, 'issued' => 1, 'other' => 0]);
});
