<?php

use App\Enums\DeliveryNoteStatus;
use App\Enums\TransactionType;
use App\Models\DeliveryNote;
use App\Models\Facility;
use App\Models\Product;
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
    $this->lgaStore = Facility::storeForLga($this->h['lgas']['kadunaNorth']);
    $this->stateStore = Facility::storeForState($this->h['states']['kaduna']);
    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
    ]);
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);
    $this->stock = function (Facility $facility, Product $product, int $qty, ?string $batch = null) {
        app(StockLedgerService::class)->record(
            facility: $facility, product: $product, type: TransactionType::Receipt, quantity: $qty,
            transactionDate: CarbonImmutable::parse('2026-09-20'), performedBy: $this->h['users']['admin'],
            batchNo: $batch, expiryDate: $batch ? '2027-08-31' : null, counterparty: 'Supplier',
        );
    };
    $this->dispatch = fn (array $overrides = []) => [
        'destination_facility_id' => $this->kawo->id,
        'dispatched_date' => '2026-09-24',
        'items' => [
            ['product_id' => $this->al->id, 'batch_no' => 'al01', 'quantity' => 30],
            ['product_id' => $this->ors->id, 'quantity' => 50],
        ],
        ...$overrides,
    ];
});

it('gives every LGA, state and the nation one store, outside the SDP rollups', function () {
    expect(Facility::whereNotNull('store_level')->count())->toBe(3 + 2 + 1);

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $this->getJson('/api/v1/auth/me')
        ->assertJsonPath('data.store.id', $this->lgaStore->id)
        ->assertJsonPath('data.store.name', 'Kaduna North LGA Store');
    $this->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/stock-summary")
        ->assertJsonPath('data.facility_count', 2)
        ->assertJsonPath('data.node.store.id', $this->lgaStore->id)
        ->assertJsonMissing(['type' => 'warehouse']);
    $this->getJson("/api/v1/facilities/{$this->lgaStore->id}")
        ->assertOk()
        ->assertJsonPath('data.store_level', 'lga')
        ->assertJsonPath('data.state.name', 'Kaduna');

    $this->actingAs($this->h['users']['state'], 'sanctum');
    $this->getJson("/api/v1/facilities/{$this->stateStore->id}")
        ->assertOk()
        ->assertJsonPath('data.lga', null)
        ->assertJsonPath('data.state.name', 'Kaduna');
    $this->getJson("/api/v1/states/{$this->h['states']['kaduna']->id}/stock-summary")->assertJsonPath('data.facility_count', 3);

    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $this->getJson('/api/v1/auth/me')->assertJsonPath('data.store', null);
});

it('lets officers record at their own store and nowhere else', function () {
    $receipt = fn (Facility $f) => $this->postJson("/api/v1/facilities/{$f->id}/stock-transactions", [
        'product_id' => $this->ors->id, 'transaction_type' => 'receipt', 'quantity' => 200,
        'counterparty' => 'UNICEF', 'transaction_date' => '2026-09-25',
    ]);

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $receipt($this->lgaStore)->assertCreated()->assertJsonPath('data.running_balance', 200);
    $receipt($this->kawo)->assertForbidden();
    $receipt(Facility::storeForLga($this->h['lgas']['zaria']))->assertForbidden();

    $this->actingAs($this->h['users']['state'], 'sanctum');
    $receipt($this->stateStore)->assertCreated();
    $receipt($this->lgaStore)->assertForbidden();

    $this->actingAs($this->h['users']['federal'], 'sanctum');
    $receipt(Facility::nationalStore())->assertCreated();
    $receipt($this->stateStore)->assertForbidden();
});

it('hides stores from people below or beside them', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $this->getJson("/api/v1/facilities/{$this->lgaStore->id}")->assertForbidden();

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $this->getJson("/api/v1/facilities/{$this->stateStore->id}")->assertForbidden();
    $this->getJson('/api/v1/facilities/'.Facility::storeForLga($this->h['lgas']['zaria'])->id)->assertForbidden();

    $this->actingAs($this->h['users']['state'], 'sanctum');
    $this->getJson('/api/v1/facilities/'.Facility::nationalStore()->id)->assertForbidden();
    $this->getJson('/api/v1/facilities/'.Facility::storeForState($this->h['states']['lagos'])->id)->assertForbidden();
});

it('lists dispatch destinations one level down the chain', function () {
    $names = fn (Facility $from, User $user) => collect($this->actingAs($user, 'sanctum')
        ->getJson("/api/v1/facilities/{$from->id}/dispatch-destinations")->assertOk()->json('data'))->pluck('name')->all();

    expect($names($this->lgaStore, $this->h['users']['lga']))->toBe(['Kawo PHC', 'Rimi PHC'])
        ->and($names($this->stateStore, $this->h['users']['state']))
        ->toBe(['Kaduna North LGA Store', 'Kawo PHC', 'Rimi PHC', 'Tudun Wada PHC', 'Zaria LGA Store'])
        ->and($names(Facility::nationalStore(), $this->h['users']['federal']))->toBe(['Kaduna State Store', 'Lagos State Store']);

    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->kawo->id}/dispatch-destinations")->assertForbidden();
});

it('issues off the store card at once and lands at the receiver only when they confirm', function () {
    ($this->stock)($this->lgaStore, $this->al, 100, 'AL01');
    ($this->stock)($this->lgaStore, $this->ors, 80);

    $note = $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->postJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches", ($this->dispatch)(['comments' => 'September allocation']))
        ->assertCreated()
        ->assertJsonPath('data.status', 'draft')
        ->assertJsonPath('data.facility.id', $this->kawo->id)
        ->assertJsonPath('data.source_facility.id', $this->lgaStore->id)
        ->assertJsonPath('data.source', 'Kaduna North LGA Store')
        ->assertJsonPath('data.dispatched_date', '2026-09-24')
        ->assertJsonPath('data.items.0.batch_no', 'AL01')
        ->assertJsonPath('data.items.0.expiry_date', '2027-08-31')
        ->json('data');
    expect($note['delivery_note_no'])->toBe(sprintf('DSP-%06d', $note['id']));

    $issues = StockTransaction::where('facility_id', $this->lgaStore->id)->where('transaction_type', 'issue')->orderBy('id')->get();
    expect($issues->pluck('quantity')->all())->toBe([30, 50])
        ->and($issues->pluck('counterparty')->unique()->all())->toBe(['Kawo PHC'])
        ->and($issues->pluck('voucher_no')->unique()->all())->toBe([$note['delivery_note_no']])
        ->and(array_column($note['items'], 'source_transaction_id'))->toBe($issues->pluck('id')->all())
        ->and(StockTransaction::where('facility_id', $this->kawo->id)->count())->toBe(0);

    // The sender sees it as outgoing, not yet received.
    $this->getJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches?status=draft")
        ->assertJsonPath('meta.pagination.total', 1)
        ->assertJsonPath('data.0.id', $note['id']);

    // The receiver confirms it, dated when it actually arrived.
    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $this->getJson("/api/v1/facilities/{$this->kawo->id}/delivery-notes?status=draft")->assertJsonPath('data.0.id', $note['id']);
    $this->postJson("/api/v1/delivery-notes/{$note['id']}/confirm", ['received_date' => '2026-09-23'])
        ->assertUnprocessable()->assertJsonValidationErrors('received_date');
    $this->postJson("/api/v1/delivery-notes/{$note['id']}/confirm", ['received_date' => '2026-09-25'])
        ->assertOk()
        ->assertJsonPath('data.status', 'confirmed')
        ->assertJsonPath('data.received_date', '2026-09-25');

    $receipts = StockTransaction::where('facility_id', $this->kawo->id)->orderBy('id')->get();
    expect($receipts->pluck('transaction_type')->unique()->all())->toBe([TransactionType::Receipt])
        ->and($receipts->pluck('counterparty')->unique()->all())->toBe(['Kaduna North LGA Store'])
        ->and($receipts->pluck('transaction_date')->map->toDateString()->unique()->all())->toBe(['2026-09-25'])
        ->and($receipts->pluck('running_balance')->all())->toBe([30, 50]);
});

it('puts rejected dispatches back on the sender\'s card', function () {
    ($this->stock)($this->lgaStore, $this->al, 100, 'AL01');
    ($this->stock)($this->lgaStore, $this->ors, 80);

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $id = $this->postJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches", ($this->dispatch)())->assertCreated()->json('data.id');

    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $note = $this->postJson("/api/v1/delivery-notes/{$id}/reject", ['reason' => 'Cold chain broken'])
        ->assertOk()
        ->assertJsonPath('data.status', 'rejected')
        ->json('data');

    $returns = StockTransaction::where('facility_id', $this->lgaStore->id)->where('counterparty', 'Kawo PHC (returned)')->orderBy('id')->get();
    expect($returns->pluck('transaction_type')->unique()->all())->toBe([TransactionType::Receipt])
        ->and($returns->pluck('running_balance')->all())->toBe([100, 80])
        ->and($returns->first()->comments)->toBe('Delivery rejected by the receiver: Cold chain broken')
        ->and(array_column($note['items'], 'return_transaction_id'))->toBe($returns->pluck('id')->all())
        ->and(StockTransaction::where('facility_id', $this->kawo->id)->count())->toBe(0);
});

it('rejects a dispatch that breaks a ledger rule, all or nothing', function () {
    ($this->stock)($this->lgaStore, $this->al, 100, 'AL01');
    ($this->stock)($this->lgaStore, $this->ors, 20);

    $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->postJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches", ($this->dispatch)())
        ->assertUnprocessable()
        ->assertJsonValidationErrors('items.1.quantity');

    expect(DeliveryNote::count())->toBe(0)
        ->and(StockTransaction::where('transaction_type', 'issue')->count())->toBe(0);
});

it('only dispatches from a store, to a facility one level down', function () {
    ($this->stock)($this->lgaStore, $this->ors, 80);
    $url = "/api/v1/facilities/{$this->lgaStore->id}/dispatches";
    $ors = [['product_id' => $this->ors->id, 'quantity' => 5]];

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $this->postJson($url, ($this->dispatch)(['destination_facility_id' => $this->h['facilities']['tudun']->id, 'items' => $ors]))
        ->assertUnprocessable()->assertJsonValidationErrors('destination_facility_id');
    $this->postJson($url, ($this->dispatch)(['destination_facility_id' => $this->stateStore->id, 'items' => $ors]))
        ->assertUnprocessable()->assertJsonValidationErrors('destination_facility_id');
    $this->postJson($url, ($this->dispatch)(['items' => [['product_id' => $this->al->id, 'quantity' => 5]]]))
        ->assertUnprocessable()->assertJsonValidationErrors('items.0.batch_no');

    $this->actingAs($this->h['users']['state'], 'sanctum')->postJson($url, ($this->dispatch)(['items' => $ors]))->assertForbidden();
    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->postJson("/api/v1/facilities/{$this->kawo->id}/dispatches", ($this->dispatch)(['destination_facility_id' => $this->h['facilities']['rimi']->id, 'items' => $ors]))
        ->assertForbidden();
});

it('replays a dispatch with the same client_reference instead of issuing twice', function () {
    ($this->stock)($this->lgaStore, $this->ors, 80);
    $body = ($this->dispatch)(['items' => [['product_id' => $this->ors->id, 'quantity' => 5]], 'client_reference' => 'dsp-1']);

    $this->actingAs($this->h['users']['lga'], 'sanctum');
    $first = $this->postJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches", $body)->assertCreated()->json('data.id');
    $this->postJson("/api/v1/facilities/{$this->lgaStore->id}/dispatches", $body)->assertOk()->assertJsonPath('data.id', $first);

    expect(StockTransaction::where('transaction_type', 'issue')->count())->toBe(1)
        ->and(DeliveryNote::sole()->status)->toBe(DeliveryNoteStatus::Draft);
});
