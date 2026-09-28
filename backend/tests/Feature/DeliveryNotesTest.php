<?php

use App\Enums\TransactionType;
use App\Models\DeliveryNote;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use App\Models\User;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->kawo = $this->h['facilities']['kawo'];
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
    ]);
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);
    $this->url = "/api/v1/facilities/{$this->kawo->id}/delivery-notes";
    $this->note = fn (array $overrides = []) => [
        'delivery_note_no' => 'DN-0042',
        'source' => 'Kaduna State CMS',
        'received_date' => '2026-09-25',
        'capture_method' => 'ocr',
        'items' => [
            ['product_id' => $this->al->id, 'batch_no' => ' al2409b ', 'expiry_date' => '2027-08-31', 'quantity' => 40],
            ['product_id' => $this->ors->id, 'quantity' => 100],
        ],
        ...$overrides,
    ];
});

it('saves a draft without touching the ledger, then confirms it into receipts', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');

    $draft = $this->postJson($this->url, ($this->note)())
        ->assertCreated()
        ->assertJsonPath('data.status', 'draft')
        ->assertJsonPath('data.capture_method', 'ocr')
        ->assertJsonPath('data.items.0.batch_no', 'AL2409B')
        ->json('data');
    expect(StockTransaction::count())->toBe(0);

    $confirmed = $this->postJson("/api/v1/delivery-notes/{$draft['id']}/confirm")
        ->assertOk()
        ->assertJsonPath('data.status', 'confirmed')
        ->assertJsonPath('data.confirmed_by_name', $this->h['users']['sdp']->name)
        ->json('data');

    $receipts = StockTransaction::orderBy('id')->get();
    expect($receipts)->toHaveCount(2)
        ->and($receipts->pluck('transaction_type')->all())->toBe([TransactionType::Receipt, TransactionType::Receipt])
        ->and($receipts->pluck('counterparty')->unique()->all())->toBe(['Kaduna State CMS'])
        ->and($receipts->pluck('voucher_no')->unique()->all())->toBe(['DN-0042'])
        ->and($receipts->pluck('delivery_note_id')->unique()->all())->toBe([$draft['id']])
        ->and(array_column($confirmed['items'], 'stock_transaction_id'))->toBe($receipts->pluck('id')->all())
        ->and((int) StockBalance::where('product_id', $this->ors->id)->sum('quantity_on_hand'))->toBe(100);

    // Already confirmed: can't post twice.
    $this->postJson("/api/v1/delivery-notes/{$draft['id']}/confirm")->assertUnprocessable()->assertJsonValidationErrors('status');
});

it('creates and confirms in one request, idempotently (the phone\'s reviewed scan)', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $body = ($this->note)(['confirm' => true, 'client_reference' => 'scan-1']);

    $first = $this->postJson($this->url, $body)->assertCreated()->assertJsonPath('data.status', 'confirmed')->json('data.id');
    $this->postJson($this->url, $body)->assertOk()->assertJsonPath('data.id', $first);

    expect(DeliveryNote::count())->toBe(1)->and(StockTransaction::count())->toBe(2);
});

it('posts all lines or none, naming the line that broke a ledger rule', function () {
    $admin = $this->h['users']['admin'];
    // A later ORS entry already exists, so a receipt dated before it would back-date the card.
    app(StockLedgerService::class)->record($this->kawo, $this->ors, TransactionType::Receipt, 5, CarbonImmutable::parse('2026-09-26'), $admin, counterparty: 'CMS');

    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->postJson($this->url, ($this->note)(['confirm' => true]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('received_date');

    // Nothing from the note was kept: not the note, not the AL line that was fine.
    expect(DeliveryNote::count())->toBe(0)->and(StockTransaction::count())->toBe(1);
});

it('validates batch rules per line', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->postJson($this->url, ($this->note)(['items' => [
            ['product_id' => $this->al->id, 'quantity' => 5],
            ['product_id' => $this->ors->id, 'batch_no' => 'X1', 'quantity' => 5],
        ]]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['items.0.batch_no', 'items.1.batch_no']);
});

it('lets facility staff reject a draft and officers only look', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $id = $this->postJson($this->url, ($this->note)())->json('data.id');

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $this->getJson($this->url)->assertOk()->assertJsonPath('data.0.id', $id);
    $this->getJson("/api/v1/delivery-notes/{$id}")->assertOk();
    $this->postJson("/api/v1/delivery-notes/{$id}/confirm")->assertForbidden();
    $this->postJson($this->url, ($this->note)())->assertForbidden();

    // Staff at another facility can't see it at all.
    $other = User::factory()->sdpStaff($this->h['facilities']['rimi']->id)->create();
    $this->actingAs($other, 'sanctum')->getJson("/api/v1/delivery-notes/{$id}")->assertForbidden();

    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->postJson("/api/v1/delivery-notes/{$id}/reject", ['reason' => 'Wrong facility on the note'])
        ->assertOk()
        ->assertJsonPath('data.status', 'rejected')
        ->assertJsonPath('data.rejection_reason', 'Wrong facility on the note');
    expect(StockTransaction::count())->toBe(0);
});
