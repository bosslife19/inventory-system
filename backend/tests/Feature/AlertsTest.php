<?php

use App\Enums\TransactionType;
use App\Models\Alert;
use App\Models\Product;
use App\Services\AlertEngine;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();

    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
    ]);
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 10, 'max_stock_level' => 100, 'reorder_level' => 40,
    ]);

    $this->rec = function ($facility, $product, TransactionType $type, int $qty, ?string $batch = null, ?string $expiry = null) {
        return app(StockLedgerService::class)->record(
            $facility, $product, $type, $qty, CarbonImmutable::today(), $this->h['users']['admin'],
            batchNo: $batch, expiryDate: $expiry, counterparty: 'CMS',
        );
    };
});

/** @return list<string> "type:status" for a facility's alerts, oldest first */
function alertStates(int $facilityId): array
{
    return Alert::where('facility_id', $facilityId)->orderBy('id')->get()
        ->map(fn (Alert $a) => "{$a->alert_type->value}:{$a->status->value}")
        ->all();
}

it('raises a stock-out when stock runs out and auto-resolves it on restock', function () {
    $kawo = $this->h['facilities']['kawo'];
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 50);
    expect(alertStates($kawo->id))->toBe([]);

    ($this->rec)($kawo, $this->ors, TransactionType::Issue, 50);
    $alert = Alert::sole();
    expect($alert->alert_type->value)->toBe('stock_out')
        ->and($alert->severity->value)->toBe('critical')
        ->and($alert->status->value)->toBe('open')
        ->and($alert->batch_id)->toBeNull();

    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 60);
    $alert->refresh();
    expect($alert->status->value)->toBe('resolved')
        ->and($alert->resolved_by)->toBeNull()
        ->and($alert->condition_cleared_at)->not->toBeNull();
});

it('moves from low stock to stock-out as separate alerts', function () {
    $kawo = $this->h['facilities']['kawo'];
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 5); // below min 10

    expect(alertStates($kawo->id))->toBe(['low_stock:open']);

    ($this->rec)($kawo, $this->ors, TransactionType::Issue, 5);
    expect(alertStates($kawo->id))->toBe(['low_stock:resolved', 'stock_out:open']);
});

it('raises expiry alerts per batch, and the scheduled pass catches expiry by date alone', function () {
    $kawo = $this->h['facilities']['kawo'];
    ($this->rec)($kawo, $this->al, TransactionType::Receipt, 40, 'SOON', '2026-10-26'); // within 90 days
    ($this->rec)($kawo, $this->al, TransactionType::Receipt, 40, 'LATER', '2027-12-31');

    $alert = Alert::sole();
    expect($alert->alert_type->value)->toBe('expiring_soon')
        ->and($alert->severity->value)->toBe('info')
        ->and($alert->batch->batch_no)->toBe('SOON');

    // No ledger activity, just the calendar: the batch expires.
    CarbonImmutable::setTestNow('2026-10-27 06:00:00');
    $this->artisan('stock:refresh-status')->assertSuccessful();

    expect(alertStates($kawo->id))->toBe(['expiring_soon:resolved', 'expired:open'])
        ->and(Alert::where('alert_type', 'expired')->sole()->batch->batch_no)->toBe('SOON');

    // Disposing of the expired batch clears the condition.
    ($this->rec)($kawo, $this->al, TransactionType::Loss, 40, 'SOON');
    expect(alertStates($kawo->id))->toBe(['expiring_soon:resolved', 'expired:resolved']);
});

it('does not re-raise a manually resolved alert until the condition clears and recurs', function () {
    $kawo = $this->h['facilities']['kawo'];
    $engine = app(AlertEngine::class);
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 5);

    $this->actingAs($this->h['users']['sdp'], 'sanctum')
        ->postJson('/api/v1/alerts/'.Alert::sole()->id.'/resolve')
        ->assertOk()
        ->assertJsonPath('data.status', 'resolved')
        ->assertJsonPath('data.condition_active', true);

    $engine->evaluate($kawo);
    expect(alertStates($kawo->id))->toBe(['low_stock:resolved']);

    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 50); // clears
    ($this->rec)($kawo, $this->ors, TransactionType::Issue, 50); // recurs (5 left)
    expect(alertStates($kawo->id))->toBe(['low_stock:resolved', 'low_stock:open']);
});

it('lists alerts within the caller scope, most severe first, unresolved by default', function () {
    ['kawo' => $kawo, 'rimi' => $rimi, 'tudun' => $tudun, 'ikejaGh' => $ikeja] = $this->h['facilities'];
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 5); // low_stock (warning)
    ($this->rec)($rimi, $this->ors, TransactionType::Receipt, 1);
    ($this->rec)($rimi, $this->ors, TransactionType::Issue, 1); // stock_out (critical)
    ($this->rec)($tudun, $this->ors, TransactionType::Receipt, 5);
    ($this->rec)($ikeja, $this->ors, TransactionType::Receipt, 5);

    $names = fn (string $user, string $query = '') => collect(
        $this->actingAs($this->h['users'][$user], 'sanctum')->getJson("/api/v1/alerts{$query}")->assertOk()->json('data')
    )->map(fn ($a) => "{$a['facility']['name']}:{$a['alert_type']}")->all();

    expect($names('sdp'))->toBe(['Kawo PHC:low_stock'])
        ->and($names('lga'))->toBe(['Rimi PHC:stock_out', 'Kawo PHC:low_stock'])
        ->and($names('state'))->toHaveCount(3)->not->toContain('Ikeja GH:low_stock')
        ->and($names('federal'))->toHaveCount(4)
        ->and($names('lga', '?severity=critical'))->toBe(['Rimi PHC:stock_out'])
        ->and($names('lga', "?facility_id={$kawo->id}"))->toBe(['Kawo PHC:low_stock'])
        // A facility outside the scope only narrows to nothing, never widens.
        ->and($names('lga', "?facility_id={$ikeja->id}"))->toBe([]);

    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 50);
    expect($names('lga'))->toBe(['Rimi PHC:stock_out'])
        ->and($names('lga', '?status=resolved'))->toEqualCanonicalizing(['Rimi PHC:low_stock', 'Kawo PHC:low_stock']);
});

it('acknowledges alerts in scope and refuses others', function () {
    ['kawo' => $kawo, 'ikejaGh' => $ikeja] = $this->h['facilities'];
    ($this->rec)($kawo, $this->ors, TransactionType::Receipt, 5);
    ($this->rec)($ikeja, $this->ors, TransactionType::Receipt, 5);
    [$mine, $sideways] = Alert::orderBy('id')->get()->all();

    $lga = $this->h['users']['lga'];
    $this->actingAs($lga, 'sanctum')
        ->postJson("/api/v1/alerts/{$mine->id}/acknowledge")
        ->assertOk()
        ->assertJsonPath('data.status', 'acknowledged')
        ->assertJsonPath('data.acknowledged_by_name', $lga->name);

    $this->postJson("/api/v1/alerts/{$sideways->id}/acknowledge")->assertForbidden();
    $this->postJson("/api/v1/alerts/{$sideways->id}/resolve")->assertForbidden();

    $this->postJson("/api/v1/alerts/{$mine->id}/resolve")->assertOk();
    $this->postJson("/api/v1/alerts/{$mine->id}/acknowledge")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');
});

it('resumes the scheduled pass and skips it once complete for the day', function () {
    ($this->rec)($this->h['facilities']['kawo'], $this->ors, TransactionType::Receipt, 5);
    Alert::query()->delete();

    $this->artisan('stock:refresh-status')
        ->expectsOutputToContain('Evaluated 4 facilities: 1 alerts raised, 0 cleared.')
        ->assertSuccessful();
    expect(Cache::get('stock:refresh-status:completed_on'))->toBe('2026-09-26');

    $this->artisan('stock:refresh-status')->expectsOutputToContain('already completed today')->assertSuccessful();
});
