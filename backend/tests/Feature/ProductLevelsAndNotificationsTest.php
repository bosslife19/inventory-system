<?php

use App\Contracts\PushSender;
use App\Enums\AlertType;
use App\Enums\TransactionType;
use App\Models\Alert;
use App\Models\AmcSnapshot;
use App\Models\Facility;
use App\Models\Product;
use App\Models\UserNotification;
use App\Services\AlertDigest;
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
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->rec = fn (Facility $facility, TransactionType $type, int $qty) => app(StockLedgerService::class)->record(
        $facility, $this->ors, $type, $qty, CarbonImmutable::today(), $this->u['admin'], counterparty: 'CMS',
    );
    $this->stock = fn () => $this->actingAs($this->u['sdp'], 'sanctum')
        ->getJson("/api/v1/facilities/{$this->kawo->id}/stock-balances")->json('data.0');
});

// ---------------------------------------------------------------- EOP below min

it('raises the low-stock alert at the EOP, and calls stock below min "reorder" without one', function () {
    ($this->rec)($this->kawo, TransactionType::Receipt, 25); // below min 40, above EOP 10

    expect(($this->stock)())->toMatchArray(['level' => 'reorder', 'flags' => []])
        ->and(Alert::count())->toBe(0);

    ($this->rec)($this->kawo, TransactionType::Issue, 15); // 10: at the EOP

    expect(($this->stock)()['level'])->toBe('low_stock')
        ->and(Alert::where('alert_type', AlertType::LowStock)->count())->toBe(1);
});

// ---------------------------------------------------------------- per-facility levels

it('lets each facility set its own min / EOP / max, which drive its level and alerts', function () {
    ($this->rec)($this->kawo, TransactionType::Receipt, 25);
    $url = "/api/v1/facilities/{$this->kawo->id}/product-levels";

    $this->actingAs($this->u['sdp'], 'sanctum')->getJson($url)->assertOk()
        ->assertJsonPath('data.0.product.sku', 'ORS')->assertJsonPath('data.0.reorder_level', 10)->assertJsonPath('data.0.source', 'catalog');

    $this->putJson("{$url}/{$this->ors->id}", ['min_stock_level' => 60, 'reorder_level' => 60, 'max_stock_level' => 200])
        ->assertUnprocessable()->assertJsonValidationErrors('reorder_level');
    $this->putJson("{$url}/{$this->ors->id}", ['min_stock_level' => 60, 'reorder_level' => 30, 'max_stock_level' => 200])
        ->assertOk()->assertJsonPath('data.reorder_level', 30)->assertJsonPath('data.source', 'facility')
        ->assertJsonPath('data.updated_by_name', $this->u['sdp']->name);

    // 25 is now at/below Kawo's EOP of 30: alert raised straight away, other facilities unaffected.
    expect(($this->stock)())->toMatchArray(['level' => 'low_stock', 'levels' => [
        'min_stock_level' => 60, 'reorder_level' => 30, 'max_stock_level' => 200, 'source' => 'facility', 'amc' => null,
    ]])
        ->and(Alert::where(['facility_id' => $this->kawo->id, 'alert_type' => AlertType::LowStock])->live()->count())->toBe(1)
        ->and($this->ors->fresh()->reorder_level)->toBe(10);

    $this->deleteJson("{$url}/{$this->ors->id}")->assertNoContent();
    expect(($this->stock)())->toMatchArray(['level' => 'reorder'])
        ->and(($this->stock)()['levels']['source'])->toBe('catalog')
        ->and(Alert::live()->count())->toBe(0);
});

it('works min / EOP / max out from the AMC once there is one: 2, 1 and 5 months of it', function () {
    ($this->rec)($this->kawo, TransactionType::Receipt, 35); // fixed levels: min 40, EOP 10 → "reorder"
    expect(($this->stock)()['level'])->toBe('reorder');

    // Starting AMC 20: min 40, EOP 20, max 100 — 35 is still only below min.
    $this->actingAs($this->u['sdp'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->kawo->id}/product-amcs/{$this->ors->id}", ['amc_quantity' => 20])->assertOk();
    ($this->rec)($this->kawo, TransactionType::Issue, 15); // 20: at the EOP of 1 month

    expect(($this->stock)())->toMatchArray(['level' => 'low_stock', 'levels' => [
        'min_stock_level' => 40, 'reorder_level' => 20, 'max_stock_level' => 100, 'source' => 'amc', 'amc' => 20.0,
    ]])->and(Alert::where(['facility_id' => $this->kawo->id, 'alert_type' => AlertType::LowStock])->live()->count())->toBe(1);

    // A full window of history replaces the entered AMC: 8 a month → min 16, EOP 8, max 40.
    AmcSnapshot::create(['facility_id' => $this->kawo->id, 'product_id' => $this->ors->id, 'period_month' => '2026-10-01', 'amc_quantity' => 8, 'months_used' => 3, 'suggested_reorder_quantity' => 0]);
    $this->artisan('stock:refresh-status', ['--facility' => [$this->kawo->id]])->assertSuccessful();

    expect(($this->stock)())->toMatchArray(['level' => 'ok', 'levels' => [
        'min_stock_level' => 16, 'reorder_level' => 8, 'max_stock_level' => 40, 'source' => 'amc', 'amc' => 8.0,
    ]])->and(Alert::where(['facility_id' => $this->kawo->id, 'alert_type' => AlertType::LowStock])->live()->count())->toBe(0);

    $levels = $this->getJson("/api/v1/facilities/{$this->kawo->id}/product-levels")->json('data.0');
    expect($levels)->toMatchArray(['min_stock_level' => 40, 'reorder_level' => 10, 'source' => 'catalog', 'entered_amc' => 20.0])
        ->and($levels['amc_levels'])->toEqual(['amc' => 8.0, 'min_stock_level' => 16, 'reorder_level' => 8, 'max_stock_level' => 40]);

    $row = $this->getJson("/api/v1/reports/stock-status?area=facility&id={$this->kawo->id}")->json('data.rows.0');
    expect($row)->toMatchArray(['level' => 'OK', 'min' => 16, 'eop' => 8, 'max' => 40]);
});

it('lets only whoever keeps the Stock Card set its levels', function () {
    $body = ['min_stock_level' => 60, 'reorder_level' => 30, 'max_stock_level' => 200];
    $store = Facility::storeForLga($this->h['lgas']['kadunaNorth']);

    $this->actingAs($this->u['lga'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->kawo->id}/product-levels/{$this->ors->id}", $body)->assertForbidden();
    $this->putJson("/api/v1/facilities/{$store->id}/product-levels/{$this->ors->id}", $body)->assertOk();
    $this->getJson("/api/v1/facilities/{$this->kawo->id}/product-levels")->assertOk(); // may still read them

    $this->actingAs($this->u['sdp'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->h['facilities']['rimi']->id}/product-levels/{$this->ors->id}", $body)->assertForbidden();
    $this->actingAs($this->u['admin'], 'sanctum')
        ->putJson("/api/v1/facilities/{$this->kawo->id}/product-levels/{$this->ors->id}", $body)->assertOk();
});

// ---------------------------------------------------------------- notifications

it('notifies whoever keeps the Stock Card of each new alert, and lists them per user', function () {
    $this->u['sdp']->update(['fcm_token' => 'kawo-phone']);
    $this->u['lga']->update(['fcm_token' => 'lga-phone']);

    ($this->rec)($this->kawo, TransactionType::Receipt, 5); // at EOP at an SDP: its staff, not the LGA officer
    ($this->rec)(Facility::storeForLga($this->h['lgas']['kadunaNorth']), TransactionType::Receipt, 5); // at the LGA store: the LGA officer

    expect(array_map(fn ($s) => [$s['tokens'], $s['title']], $this->push->sent))->toBe([
        [['kawo-phone'], 'At EOP: ORS'],
        [['lga-phone'], 'At EOP: ORS'],
    ]);

    $mine = $this->actingAs($this->u['sdp'], 'sanctum')->getJson('/api/v1/notifications')->assertOk()
        ->assertJsonPath('meta.unread_count', 1)->assertJsonPath('data.0.type', 'alert')
        ->assertJsonPath('data.0.payload.alert_type', 'low_stock')->json('data.0');
    expect($mine['pushed_at'])->not->toBeNull()->and($mine['read_at'])->toBeNull();

    $theirs = UserNotification::where('user_id', $this->u['lga']->id)->sole();
    $this->postJson("/api/v1/notifications/{$theirs->id}/read")->assertNotFound();
    $this->postJson("/api/v1/notifications/{$mine['id']}/read")->assertOk()->assertJsonPath('data.read_at', '2026-10-17T10:00:00.000000Z');
    $this->getJson('/api/v1/notifications?unread=true')->assertJsonPath('meta.unread_count', 0)->assertJsonCount(0, 'data');

    $this->actingAs($this->u['lga'], 'sanctum')->postJson('/api/v1/notifications/read-all')->assertNoContent();
    expect($theirs->fresh()->read_at)->not->toBeNull();
});

it('sends officers a digest of new alerts in their area, once per batch of new alerts', function () {
    $this->u['lga']->update(['fcm_token' => 'lga-phone']);
    ($this->rec)($this->kawo, TransactionType::Receipt, 5);                                  // Kawo at EOP
    ($this->rec)($this->h['facilities']['rimi'], TransactionType::Receipt, 50);
    ($this->rec)($this->h['facilities']['rimi'], TransactionType::Issue, 50);                // Rimi stock-out
    ($this->rec)($this->h['facilities']['ikejaGh'], TransactionType::Receipt, 5);            // Lagos: not Kaduna's business
    ($this->rec)(Facility::storeForLga($this->h['lgas']['kadunaNorth']), TransactionType::Receipt, 5); // own store: told directly
    $this->push->sent = [];

    CarbonImmutable::setTestNow('2026-10-18 08:30:00');
    expect(app(AlertDigest::class)->sendAll())->toBe(4); // LGA, state, federal, admin

    $lga = UserNotification::where(['user_id' => $this->u['lga']->id, 'type' => 'digest'])->sole();
    expect($lga->title)->toBe('Kaduna North LGA: 2 new stock alerts')
        ->and($lga->body)->toBe('1 stock-out, 1 at EOP across 2 facilities.')
        ->and($lga->pushed_at)->not->toBeNull()
        ->and($this->push->sent)->toHaveCount(1)
        ->and($this->push->sent[0]['tokens'])->toBe(['lga-phone'])
        ->and(UserNotification::where(['user_id' => $this->u['state']->id, 'type' => 'digest'])->sole()->data['counts'])
        ->toMatchArray(['stock_out' => 1, 'low_stock' => 2]) // Kawo + the Kaduna North store
        ->and(UserNotification::where(['user_id' => $this->u['federal']->id, 'type' => 'digest'])->sole()->title)
        ->toBe('Nigeria: 4 new stock alerts');

    // Nothing new since: nobody hears again.
    CarbonImmutable::setTestNow('2026-10-18 09:00:00');
    expect(app(AlertDigest::class)->sendAll())->toBe(0);

    ($this->rec)($this->h['facilities']['tudun'], TransactionType::Receipt, 5); // Zaria: state and above only
    CarbonImmutable::setTestNow('2026-10-19 08:30:00');
    expect(app(AlertDigest::class)->sendAll())->toBe(3)
        ->and(UserNotification::where(['user_id' => $this->u['state']->id, 'type' => 'digest'])->latest('id')->first()->body)
        ->toBe('1 at EOP across 1 facility.');
});

it('runs the digest from the scheduler command', function () {
    ($this->rec)($this->kawo, TransactionType::Receipt, 5);
    CarbonImmutable::setTestNow('2026-10-18 08:30:00');

    $this->artisan('alerts:send-digests')->expectsOutput('Sent 4 digests.')->assertSuccessful();
});
