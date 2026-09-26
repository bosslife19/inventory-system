<?php

use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\Product;
use App\Models\State;
use App\Models\StockBalance;
use App\Models\User;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');

    $state = State::create(['name' => 'Kaduna', 'geopolitical_zone' => 'north_west']);
    $lga = Lga::create(['state_id' => $state->id, 'name' => 'Kaduna North']);
    $this->facilities = collect(range(1, 3))->map(fn ($i) => Facility::create([
        'lga_id' => $lga->id, 'name' => "PHC {$i}", 'type' => 'health_center',
    ]));
    $product = Product::create([
        'name' => 'AL', 'sku' => 'AL', 'category' => 'x', 'unit_of_measure' => 'pack', 'requires_batch_tracking' => true,
    ]);
    $user = User::factory()->admin()->create();

    $ledger = app(StockLedgerService::class);
    foreach ($this->facilities as $facility) {
        $record = fn (TransactionType $type, int $qty, string $date) => $ledger->record(
            $facility, $product, $type, $qty, CarbonImmutable::parse($date), $user,
            batchNo: 'B1', expiryDate: '2027-01-01', counterparty: 'CMS',
        );
        $record(TransactionType::Receipt, 50, '2026-09-01');
        $record(TransactionType::Issue, 20, '2026-09-05');
        $record(TransactionType::PhysicalCount, 28, '2026-09-10');
        $record(TransactionType::Receipt, 10, '2026-09-12');
    }
});

it('finds nothing to fix when balances match the ledger', function () {
    $this->artisan('stock:reconcile')->assertSuccessful();

    expect(StockBalance::pluck('quantity_on_hand')->unique()->all())->toBe([38]);
});

it('corrects drift, recreates missing rows and removes orphans', function () {
    [$a, $b, $c] = $this->facilities;
    StockBalance::where('facility_id', $a->id)->update(['quantity_on_hand' => 999]);
    StockBalance::where('facility_id', $b->id)->delete();
    StockBalance::create([
        'facility_id' => $c->id, 'product_id' => StockBalance::value('product_id'),
        'batch_id' => null, 'quantity_on_hand' => 5, 'last_transaction_id' => StockBalance::value('last_transaction_id'),
    ]);

    $this->artisan('stock:reconcile')->assertSuccessful();

    expect(StockBalance::orderBy('facility_id')->pluck('quantity_on_hand', 'facility_id')->all())
        ->toBe([$a->id => 38, $b->id => 38, $c->id => 38]);
});

it('resumes where it stopped when the time budget runs out, then idles for the day', function () {
    Cache::flush();
    StockBalance::query()->update(['quantity_on_hand' => 0]);

    // Budget of 0s: processes one facility per run.
    $this->artisan('stock:reconcile', ['--max-seconds' => 0])->assertSuccessful();
    expect(StockBalance::where('quantity_on_hand', 38)->count())->toBe(1);

    $this->artisan('stock:reconcile', ['--max-seconds' => 0])->assertSuccessful();
    $this->artisan('stock:reconcile', ['--max-seconds' => 0])->assertSuccessful();
    expect(StockBalance::where('quantity_on_hand', 38)->count())->toBe(3);

    StockBalance::query()->update(['quantity_on_hand' => 0]);
    $this->artisan('stock:reconcile')->expectsOutputToContain('already completed today')->assertSuccessful();
    expect(StockBalance::where('quantity_on_hand', 0)->count())->toBe(3);

    $this->artisan('stock:reconcile', ['--force' => true])->assertSuccessful();
    expect(StockBalance::where('quantity_on_hand', 38)->count())->toBe(3);
});

it('can target specific facilities', function () {
    StockBalance::query()->update(['quantity_on_hand' => 0]);

    $this->artisan('stock:reconcile', ['--facility' => [$this->facilities[1]->id]])->assertSuccessful();

    expect(StockBalance::where('quantity_on_hand', 38)->pluck('facility_id')->all())->toBe([$this->facilities[1]->id]);
});
