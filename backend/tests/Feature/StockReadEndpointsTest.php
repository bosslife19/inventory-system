<?php

use App\Enums\TransactionType;
use App\Models\Product;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    ['kawo' => $kawo, 'rimi' => $rimi] = $this->h['facilities'];

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
    $rec = fn ($facility, $product, TransactionType $type, int $qty, string $date, ?string $batch = null, ?string $expiry = null) => $ledger->record($facility, $product, $type, $qty, CarbonImmutable::parse($date), $admin, batchNo: $batch, expiryDate: $expiry, counterparty: 'CMS');

    // Kawo AL: 10 expired + 25 ok (expiring in 30 days) => usable 25: reorder (<= 30), flags expired + expiring_soon
    $rec($kawo, $this->al, TransactionType::Receipt, 10, '2026-06-01', 'OLD', '2026-09-01');
    $rec($kawo, $this->al, TransactionType::Receipt, 25, '2026-06-02', 'NEW', '2026-10-26');
    // Kawo ORS: 80 => ok
    $rec($kawo, $this->ors, TransactionType::Receipt, 80, '2026-06-01');
    // Rimi AL: 5 (same batch, expiring soon) => low stock; Rimi ORS: received then all issued => stock out
    $rec($rimi, $this->al, TransactionType::Receipt, 5, '2026-06-01', 'NEW', '2026-10-26');
    $rec($rimi, $this->ors, TransactionType::Receipt, 20, '2026-06-01');
    $rec($rimi, $this->ors, TransactionType::Issue, 20, '2026-06-05');
});

it('returns facility stock per product with usable split, level and flags', function () {
    $data = $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}/stock-balances")
        ->assertOk()
        ->json('data');

    expect($data)->toHaveCount(2)
        ->and($data[0]['product']['sku'])->toBe('AL')
        ->and($data[0])->toMatchArray([
            'quantity_on_hand' => 35,
            'usable_quantity' => 25,
            'expired_quantity' => 10,
            'expiring_soon_quantity' => 25,
            'level' => 'reorder',
            'flags' => ['expired', 'expiring_soon'],
        ])
        ->and(array_column($data[0]['batches'], 'batch_no'))->toBe(['OLD', 'NEW'])
        ->and(array_column($data[0]['batches'], 'expiry_status'))->toBe(['expired', 'expiring_soon'])
        ->and($data[1])->toMatchArray(['quantity_on_hand' => 80, 'level' => 'ok', 'flags' => []])
        ->and($data[1]['batches'][0]['batch_no'])->toBeNull();
});

it('returns the ledger paginated in the contract shape, filterable', function () {
    $kawo = $this->h['facilities']['kawo'];
    $this->actingAs($this->h['users']['sdp'], 'sanctum');

    $this->getJson("/api/v1/facilities/{$kawo->id}/stock-transactions?per_page=2")
        ->assertOk()
        ->assertJsonPath('meta.pagination', ['current_page' => 1, 'per_page' => 2, 'total' => 3, 'last_page' => 2])
        ->assertJsonPath('data.0.transaction_date', '2026-06-02'); // newest first by default

    $this->getJson("/api/v1/facilities/{$kawo->id}/stock-transactions?product_id={$this->al->id}&order=asc")
        ->assertJsonPath('data.*.running_balance', [10, 35])
        ->assertJsonPath('data.0.product_name', 'AL 20/120')
        ->assertJsonPath('data.0.batch_no', 'OLD');

    $this->getJson("/api/v1/facilities/{$kawo->id}/stock-transactions?from=2026-06-02&to=2026-06-02")
        ->assertJsonPath('meta.pagination.total', 1);

    $this->getJson("/api/v1/facilities/{$kawo->id}/stock-transactions?transaction_type=issue")
        ->assertJsonPath('meta.pagination.total', 0);

    $this->getJson("/api/v1/facilities/{$kawo->id}/stock-transactions?from=2026-07-01&to=2026-06-01&order=sideways")
        ->assertUnprocessable()->assertJsonValidationErrors(['to', 'order']);
});

it('does not leak other facilities through the product_id filter', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}/stock-transactions?product_id={$this->ors->id}")
        ->assertJsonPath('meta.pagination.total', 1); // Rimi's two ORS rows are not included
});

it('rolls up an LGA with worst facilities first', function () {
    $data = $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/stock-summary")
        ->assertOk()
        ->json('data');

    expect($data['node'])->toMatchArray(['level' => 'lga', 'name' => 'Kaduna North'])
        ->and($data['node']['parent']['name'])->toBe('Kaduna')
        ->and($data['child_count'])->toBe(2)
        ->and($data['facility_counts'])->toBe(['stock_out' => 1, 'expired' => 1, 'low_stock' => 1, 'expiring_soon' => 2])
        ->and(array_column($data['children'], 'name'))->toBe(['Rimi PHC', 'Kawo PHC'])
        ->and($data['children'][0]['flag_counts'])->toBe(['stock_out' => 1, 'expired' => 0, 'low_stock' => 1, 'expiring_soon' => 1])
        ->and($data['children'][0]['needs_reorder_count'])->toBe(2)
        ->and($data['children'][1]['flagged_products'])->toHaveCount(1); // Kawo AL; ORS is fine

    $al = collect($data['products'])->firstWhere('product.sku', 'AL');
    expect($al)->toMatchArray([
        'quantity_on_hand' => 40,
        'usable_quantity' => 30,
        'expired_quantity' => 10,
        'facilities_needing_reorder' => 2,
    ])->and($al['facility_counts'])->toBe(['stock_out' => 0, 'expired' => 1, 'low_stock' => 1, 'expiring_soon' => 2]);
});

it('counts weekly recording activity for a facility and an LGA', function () {
    ['kawo' => $kawo, 'rimi' => $rimi] = $this->h['facilities'];
    $ledger = app(StockLedgerService::class);
    $admin = $this->h['users']['admin'];
    // This week (test "today" is Sat 2026-09-26; the week starts Mon 2026-09-21)
    $ledger->record($kawo, $this->ors, TransactionType::Issue, 5, CarbonImmutable::parse('2026-09-22'), $admin, counterparty: 'OPD');
    $ledger->record($kawo, $this->ors, TransactionType::Loss, 1, CarbonImmutable::parse('2026-09-23'), $admin);
    $ledger->record($rimi, $this->al, TransactionType::Receipt, 10, CarbonImmutable::parse('2026-09-24'), $admin, batchNo: 'NEW', counterparty: 'CMS');

    $kawoData = $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$kawo->id}/stock-activity?weeks=4")
        ->assertOk()
        ->json('data');

    expect($kawoData['weeks'])->toHaveCount(4)
        ->and(end($kawoData['weeks']))->toBe(['week_start' => '2026-09-21', 'received' => 0, 'issued' => 1, 'other' => 1])
        ->and($kawoData['last_transaction_date'])->toBe('2026-09-23');

    $lga = $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/stock-activity")
        ->assertOk()
        ->json('data');

    expect($lga['weeks'])->toHaveCount(12)
        ->and(end($lga['weeks']))->toMatchArray(['received' => 1, 'issued' => 1, 'other' => 1])
        ->and($lga['totals'])->toBe(['received' => 1, 'issued' => 1, 'other' => 1]); // the June entries are older than 12 weeks

    $this->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/stock-activity?weeks=2")->assertUnprocessable();
});

it('reports each facility\'s last entry date in the LGA rollup', function () {
    $children = collect($this->actingAs($this->h['users']['lga'], 'sanctum')
        ->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/stock-summary")
        ->json('data.children'))->keyBy('name');

    expect($children['Kawo PHC']['last_transaction_date'])->toBe('2026-06-02')
        ->and($children['Rimi PHC']['last_transaction_date'])->toBe('2026-06-05');
});

it('lists the product catalog with filters', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');

    $this->getJson('/api/v1/products')->assertJsonPath('data.*.sku', ['AL', 'ORS']);
    $this->getJson('/api/v1/products?category=Antimalarials')->assertJsonPath('data.*.sku', ['AL']);

    $this->ors->update(['is_active' => false]);
    $this->getJson('/api/v1/products?is_active=1')->assertJsonPath('data.*.sku', ['AL']);
    $this->getJson('/api/v1/products?is_active=true')->assertJsonPath('data.*.sku', ['AL']); // what HTTP clients send
    $this->getJson('/api/v1/products?is_active=false')->assertJsonPath('data.*.sku', ['ORS']);
    $this->getJson('/api/v1/products?is_active=maybe')->assertUnprocessable();
});
