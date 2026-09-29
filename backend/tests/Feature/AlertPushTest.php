<?php

use App\Contracts\PushSender;
use App\Enums\TransactionType;
use App\Models\Alert;
use App\Models\Product;
use App\Models\User;
use App\Services\AlertEngine;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/** Records sends instead of calling FCM; reports the listed tokens as dead. */
class FakePushSender implements PushSender
{
    /** @var list<array{tokens: list<string>, title: string, body: string, data: array<string, string>}> */
    public array $sent = [];

    /** @param  list<string>  $dead */
    public function __construct(private readonly array $dead = []) {}

    public function send(array $tokens, string $title, string $body, array $data = []): array
    {
        $this->sent[] = compact('tokens', 'title', 'body', 'data');

        return array_values(array_intersect($tokens, $this->dead));
    }
}

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->kawo = $this->h['facilities']['kawo'];
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);
    $this->rec = fn ($facility, TransactionType $type, int $qty) => app(StockLedgerService::class)->record(
        $facility, $this->ors, $type, $qty, CarbonImmutable::today(), $this->h['users']['admin'], counterparty: 'CMS',
    );
});

it('pushes a new alert to the facility staff, with the alert id for the deep link', function () {
    $fake = new FakePushSender;
    app()->instance(PushSender::class, $fake);
    $this->h['users']['sdp']->update(['fcm_token' => 'kawo-phone']);
    User::factory()->sdpStaff($this->h['facilities']['rimi']->id)->create(['fcm_token' => 'rimi-phone']);
    $this->h['users']['lga']->update(['fcm_token' => 'lga-phone']);

    ($this->rec)($this->kawo, TransactionType::Receipt, 50);
    expect($fake->sent)->toBe([]); // healthy stock: nothing to say

    ($this->rec)($this->kawo, TransactionType::Issue, 50);

    expect($fake->sent)->toHaveCount(1)
        ->and($fake->sent[0]['tokens'])->toBe(['kawo-phone'])
        ->and($fake->sent[0]['title'])->toBe('Stock-out: ORS')
        ->and($fake->sent[0]['data'])->toMatchArray(['alert_type' => 'stock_out', 'url' => "stockcard://alerts?focus={$fake->sent[0]['data']['alert_id']}"]);

    // Still stocked out: the same alert isn't pushed again.
    app(AlertEngine::class)->evaluate($this->kawo);
    expect($fake->sent)->toHaveCount(1);
});

it('forgets tokens FCM reports as dead', function () {
    app()->instance(PushSender::class, new FakePushSender(dead: ['old-phone']));
    $this->h['users']['sdp']->update(['fcm_token' => 'old-phone']);

    ($this->rec)($this->kawo, TransactionType::Receipt, 5); // low stock

    expect($this->h['users']['sdp']->fresh()->fcm_token)->toBeNull();
});

it('never lets a push failure undo the ledger entry', function () {
    app()->instance(PushSender::class, new class implements PushSender
    {
        public function send(array $tokens, string $title, string $body, array $data = []): array
        {
            throw new RuntimeException('FCM is down');
        }
    });
    $this->h['users']['sdp']->update(['fcm_token' => 'kawo-phone']);

    $tx = ($this->rec)($this->kawo, TransactionType::Receipt, 5);

    expect($tx->exists)->toBeTrue()
        ->and(Alert::where('alert_type', 'low_stock')->count())->toBe(1);
});
