<?php

use App\Models\Product;
use App\Models\StockTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);
    $this->url = "/api/v1/facilities/{$this->h['facilities']['kawo']->id}/stock-transactions";
    $this->entry = fn (array $overrides = []) => [
        'product_id' => $this->ors->id, 'transaction_type' => 'receipt', 'quantity' => 50,
        'transaction_date' => '2026-09-26', 'counterparty' => 'CMS', ...$overrides,
    ];
});

it('records a replayed offline entry only once', function () {
    $this->actingAs($this->h['users']['sdp'], 'sanctum');
    $ref = '7b1d2c9e-0f3a-4c55-9a71-2d6f1e8b9c01';

    $first = $this->postJson($this->url, ($this->entry)(['client_reference' => $ref]))
        ->assertCreated()
        ->assertJsonPath('data.client_reference', $ref)
        ->json('data');

    // Same entry again (lost response, outbox retries): 200 with the original row.
    $this->postJson($this->url, ($this->entry)(['client_reference' => $ref]))
        ->assertOk()
        ->assertJsonPath('data.id', $first['id'])
        ->assertJsonPath('data.running_balance', 50);

    // A different entry is still recorded.
    $this->postJson($this->url, ($this->entry)(['client_reference' => 'another-ref']))
        ->assertCreated()
        ->assertJsonPath('data.running_balance', 100);

    expect(StockTransaction::count())->toBe(2);
});

it('scopes client references to the facility', function () {
    $ref = 'same-ref';
    $this->actingAs($this->h['users']['admin'], 'sanctum');

    $this->postJson($this->url, ($this->entry)(['client_reference' => $ref]))->assertCreated();
    $this->postJson("/api/v1/facilities/{$this->h['facilities']['rimi']->id}/stock-transactions", ($this->entry)(['client_reference' => $ref]))
        ->assertCreated();

    expect(StockTransaction::count())->toBe(2);
});

it('stores and clears the device push token', function () {
    $user = $this->h['users']['sdp'];
    $this->actingAs($user, 'sanctum');

    $this->postJson('/api/v1/users/me/fcm-token', ['token' => 'fcm-token-123'])->assertNoContent();
    expect($user->fresh()->fcm_token)->toBe('fcm-token-123');

    $this->postJson('/api/v1/users/me/fcm-token', ['token' => null])->assertNoContent();
    expect($user->fresh()->fcm_token)->toBeNull();

    $this->postJson('/api/v1/users/me/fcm-token', [])->assertUnprocessable();
});
