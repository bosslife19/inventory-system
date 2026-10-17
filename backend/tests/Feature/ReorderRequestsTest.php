<?php

use App\Contracts\PushSender;
use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\UserNotification;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-17 10:00:00');
    $this->push = new class implements PushSender
    {
        public array $sent = [];

        public function send(array $tokens, string $title, string $body, array $data = []): array
        {
            $this->sent[] = compact('tokens', 'title', 'body', 'data');

            return [];
        }
    };
    app()->instance(PushSender::class, $this->push);

    $this->h = hierarchyFixture();
    $this->u = $this->h['users'];
    $this->kawo = $this->h['facilities']['kawo'];
    $this->lgaStore = Facility::storeForLga($this->h['lgas']['kadunaNorth']);
    $this->stateStore = Facility::storeForState($this->h['states']['kaduna']);
    $this->national = Facility::nationalStore();
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->stock = fn (Facility $f, int $qty) => app(StockLedgerService::class)->record(
        $f, $this->ors, TransactionType::Receipt, $qty, CarbonImmutable::today(), $this->u['admin'], counterparty: 'CMS',
    );
    $this->ask = fn (Facility $supplier, int $qty = 60) => $this->postJson("/api/v1/facilities/{$this->kawo->id}/reorder-requests", [
        'supplier_facility_id' => $supplier->id, 'comments' => 'Running low',
        'items' => [['product_id' => $this->ors->id, 'quantity' => $qty]],
    ]);
    $this->fulfil = fn (int $id, int $qty = 50) => $this->postJson("/api/v1/reorder-requests/{$id}/fulfil", [
        'dispatched_date' => '2026-10-17', 'items' => [['product_id' => $this->ors->id, 'quantity' => $qty]],
    ]);
});

it('lists the stores above a facility it may ask, nearest first', function () {
    $this->actingAs($this->u['sdp'], 'sanctum')->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-suppliers")->assertOk()
        ->assertJsonPath('data.*.id', [$this->lgaStore->id, $this->stateStore->id, $this->national->id]);
    $this->actingAs($this->u['lga'], 'sanctum')->getJson("/api/v1/facilities/{$this->lgaStore->id}/reorder-suppliers")->assertOk()
        ->assertJsonPath('data.*.id', [$this->stateStore->id, $this->national->id]);
    $this->actingAs($this->u['federal'], 'sanctum')->getJson("/api/v1/facilities/{$this->national->id}/reorder-suppliers")->assertForbidden();
});

it('lets a facility ask a store above, and tells the officers who keep that store', function () {
    $this->u['lga']->update(['fcm_token' => 'lga-phone']);
    $this->u['sdp']->update(['fcm_token' => 'kawo-phone']);

    $this->actingAs($this->u['lga'], 'sanctum');
    ($this->ask)($this->lgaStore)->assertForbidden(); // not the LGA officer's facility

    $this->actingAs($this->u['sdp'], 'sanctum');
    ($this->ask)(Facility::storeForLga($this->h['lgas']['zaria']))->assertUnprocessable()->assertJsonValidationErrors('supplier_facility_id');
    $id = ($this->ask)($this->lgaStore)->assertCreated()
        ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.supplier.id', $this->lgaStore->id)
        ->assertJsonPath('data.items.0.quantity_requested', 60)->json('data.id');

    expect($this->push->sent)->toHaveCount(1)
        ->and($this->push->sent[0]['tokens'])->toBe(['lga-phone'])
        ->and($this->push->sent[0]['title'])->toBe('Reorder request from Kawo PHC')
        ->and($this->push->sent[0]['data'])->toMatchArray(['type' => 'reorder_request', 'reorder_request_id' => (string) $id])
        ->and(UserNotification::where(['user_id' => $this->u['lga']->id, 'type' => 'reorder_request'])->count())->toBe(1);

    $this->getJson("/api/v1/facilities/{$this->kawo->id}/reorder-requests?direction=outgoing")->assertOk()->assertJsonPath('data.0.id', $id);
    $this->actingAs($this->u['lga'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->lgaStore->id}/reorder-requests?direction=incoming&status=pending")
        ->assertOk()->assertJsonPath('meta.pagination.total', 1)->assertJsonPath('data.0.facility.name', 'Kawo PHC');
});

it('fulfils a request with a dispatch the requester then confirms', function () {
    ($this->stock)($this->lgaStore, 100);
    $this->u['sdp']->update(['fcm_token' => 'kawo-phone']);
    $id = ($this->ask)->call($this->actingAs($this->u['sdp'], 'sanctum'), $this->lgaStore)->json('data.id');

    ($this->fulfil)($id)->assertForbidden(); // the requester can't fulfil their own request

    $this->actingAs($this->u['lga'], 'sanctum');
    ($this->fulfil)($id, 500)->assertUnprocessable(); // more than the store holds: nothing happens
    $this->getJson("/api/v1/reorder-requests/{$id}")->assertJsonPath('data.status', 'pending');

    $this->push->sent = [];
    $res = ($this->fulfil)($id, 50)->assertOk()
        ->assertJsonPath('data.status', 'fulfilled')->assertJsonPath('data.items.0.quantity_supplied', 50)
        ->assertJsonPath('data.delivery_note.status', 'draft')->assertJsonPath('data.responded_by_name', $this->u['lga']->name);

    expect(StockBalance::where(['facility_id' => $this->lgaStore->id, 'product_id' => $this->ors->id])->value('quantity_on_hand'))->toBe(50)
        ->and($this->push->sent[0]['tokens'])->toBe(['kawo-phone'])
        ->and($this->push->sent[0]['title'])->toBe('Your order is on its way: Kaduna North LGA Store');

    ($this->fulfil)($id)->assertUnprocessable()->assertJsonValidationErrors('status');

    // The requester signs for it like any delivery.
    $this->actingAs($this->u['sdp'], 'sanctum')
        ->postJson('/api/v1/delivery-notes/'.$res->json('data.delivery_note.id').'/confirm')->assertOk();
    expect(StockBalance::where(['facility_id' => $this->kawo->id, 'product_id' => $this->ors->id])->value('quantity_on_hand'))->toBe(50);
});

it('lets a store several levels up fulfil directly', function () {
    ($this->stock)($this->national, 100);
    $id = ($this->ask)->call($this->actingAs($this->u['sdp'], 'sanctum'), $this->national)->assertCreated()->json('data.id');

    $this->actingAs($this->u['lga'], 'sanctum');
    ($this->fulfil)($id)->assertForbidden(); // only the National Store's officers answer it
    $this->getJson("/api/v1/reorder-requests/{$id}")->assertOk(); // but the LGA can see it

    $this->actingAs($this->u['federal'], 'sanctum');
    ($this->fulfil)($id, 60)->assertOk()->assertJsonPath('data.status', 'fulfilled');
});

it('lets the store decline and the requester cancel, telling the requester when declined', function () {
    $this->actingAs($this->u['sdp'], 'sanctum');
    $declined = ($this->ask)($this->lgaStore)->json('data.id');
    $cancelled = ($this->ask)($this->stateStore)->json('data.id');

    $this->postJson("/api/v1/reorder-requests/{$declined}/reject")->assertForbidden();
    $this->actingAs($this->u['lga'], 'sanctum')->postJson("/api/v1/reorder-requests/{$declined}/reject", ['reason' => 'Out of stock here'])
        ->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.response_note', 'Out of stock here');
    expect(UserNotification::where(['user_id' => $this->u['sdp']->id, 'type' => 'reorder_request'])->sole()->body)
        ->toContain('Out of stock here');

    $this->postJson("/api/v1/reorder-requests/{$cancelled}/cancel")->assertForbidden();
    $this->actingAs($this->u['sdp'], 'sanctum')->postJson("/api/v1/reorder-requests/{$cancelled}/cancel")
        ->assertOk()->assertJsonPath('data.status', 'cancelled');
    $this->actingAs($this->u['state'], 'sanctum')->postJson("/api/v1/reorder-requests/{$cancelled}/reject")
        ->assertUnprocessable()->assertJsonValidationErrors('status');
});
