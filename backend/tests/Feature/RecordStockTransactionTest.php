<?php

use App\Models\Batch;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\Product;
use App\Models\State;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');

    $state = State::create(['name' => 'Kaduna', 'geopolitical_zone' => 'north_west']);
    $this->lga = Lga::create(['state_id' => $state->id, 'name' => 'Kaduna North']);
    $this->facility = Facility::create(['lga_id' => $this->lga->id, 'name' => 'Kawo PHC', 'type' => 'health_center']);
    $this->otherFacility = Facility::create(['lga_id' => $this->lga->id, 'name' => 'Other PHC', 'type' => 'health_center']);

    $this->al = Product::create([
        'name' => 'AL 20/120', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack',
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 60, 'reorder_level' => 30,
    ]);
    $this->gloves = Product::create([
        'name' => 'Gloves', 'sku' => 'GLV', 'category' => 'Consumables', 'unit_of_measure' => 'box',
        'requires_batch_tracking' => false,
    ]);

    $this->staff = User::factory()->sdpStaff($this->facility->id)->create();
});

function postTx(array $overrides = [], ?Facility $facility = null)
{
    $facility ??= test()->facility;

    return test()->postJson("/api/v1/facilities/{$facility->id}/stock-transactions", array_merge([
        'product_id' => test()->al->id,
        'transaction_type' => 'receipt',
        'quantity' => 60,
        'batch_no' => 'AL001',
        'expiry_date' => '2027-06-30',
        'counterparty' => 'Kaduna State CMS',
        'transaction_date' => '2026-09-01',
    ], $overrides));
}

it('records a receipt, creating the batch and balance', function () {
    Sanctum::actingAs($this->staff);

    postTx(['voucher_no' => 'SRV-1'])
        ->assertCreated()
        ->assertJsonPath('data.transaction_type', 'receipt')
        ->assertJsonPath('data.quantity', 60)
        ->assertJsonPath('data.running_balance', 60)
        ->assertJsonPath('data.batch_no', 'AL001')
        ->assertJsonPath('data.expiry_date', '2027-06-30')
        ->assertJsonPath('data.performed_by', $this->staff->id);

    expect(Batch::where('batch_no', 'AL001')->exists())->toBeTrue()
        ->and(StockBalance::sole()->quantity_on_hand)->toBe(60);
});

it('keeps running_balance per product across batches', function () {
    Sanctum::actingAs($this->staff);

    postTx(['quantity' => 60]);
    postTx(['quantity' => 30, 'batch_no' => 'AL002', 'expiry_date' => '2028-01-31']);
    postTx(['transaction_type' => 'issue', 'quantity' => 25, 'counterparty' => 'OPD', 'expiry_date' => null])
        ->assertCreated()
        ->assertJsonPath('data.running_balance', 65);

    expect(StockBalance::where('facility_id', $this->facility->id)->orderBy('id')->pluck('quantity_on_hand')->all())
        ->toBe([35, 30]);
});

it('applies each transaction type', function (string $type, int $quantity, int $expected) {
    Sanctum::actingAs($this->staff);
    postTx(['quantity' => 50]);

    postTx(['transaction_type' => $type, 'quantity' => $quantity, 'expiry_date' => null, 'counterparty' => 'X'])
        ->assertCreated()
        ->assertJsonPath('data.running_balance', $expected);
})->with([
    'issue' => ['issue', 10, 40],
    'loss' => ['loss', 5, 45],
    'adjustment_in' => ['adjustment_in', 7, 57],
    'adjustment_out' => ['adjustment_out', 7, 43],
    'transfer_in' => ['transfer_in', 20, 70],
    'transfer_out' => ['transfer_out', 20, 30],
    'physical_count sets the balance' => ['physical_count', 48, 48],
    'physical_count of zero' => ['physical_count', 0, 0],
]);

it('rejects outflows larger than stock on hand', function () {
    Sanctum::actingAs($this->staff);
    postTx(['quantity' => 10]);

    postTx(['transaction_type' => 'issue', 'quantity' => 11, 'expiry_date' => null])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['quantity' => 'Insufficient stock: 10 on hand for batch AL001.']);

    expect(StockTransaction::count())->toBe(1);
});

it('requires batch_no for batch-tracked products and forbids it otherwise', function () {
    Sanctum::actingAs($this->staff);

    postTx(['batch_no' => null])->assertUnprocessable()->assertJsonValidationErrors('batch_no');

    postTx(['product_id' => $this->gloves->id, 'quantity' => 5])
        ->assertUnprocessable()->assertJsonValidationErrors(['batch_no', 'expiry_date']);

    postTx(['product_id' => $this->gloves->id, 'quantity' => 5, 'batch_no' => null, 'expiry_date' => null])
        ->assertCreated()->assertJsonPath('data.batch_id', null);
});

it('requires expiry_date for a new batch and rejects a conflicting one', function () {
    Sanctum::actingAs($this->staff);

    postTx(['expiry_date' => null])->assertUnprocessable()->assertJsonValidationErrors('expiry_date');

    postTx();
    postTx(['expiry_date' => '2027-12-31'])->assertUnprocessable()->assertJsonValidationErrors('expiry_date');
});

it('rejects issuing a batch that was never received', function () {
    Sanctum::actingAs($this->staff);

    postTx(['transaction_type' => 'issue', 'quantity' => 1, 'batch_no' => 'NOPE', 'expiry_date' => null])
        ->assertUnprocessable()->assertJsonValidationErrors('batch_no');

    expect(Batch::count())->toBe(0);
});

it('normalizes batch numbers', function () {
    Sanctum::actingAs($this->staff);
    postTx();

    postTx(['transaction_type' => 'issue', 'quantity' => 1, 'batch_no' => '  al001 ', 'expiry_date' => null])
        ->assertCreated()->assertJsonPath('data.batch_no', 'AL001');
});

it('refuses to issue expired stock but allows writing it off', function () {
    Sanctum::actingAs($this->staff);
    postTx(['expiry_date' => '2026-09-10', 'transaction_date' => '2026-09-01']);

    postTx(['transaction_type' => 'issue', 'quantity' => 5, 'expiry_date' => null, 'transaction_date' => '2026-09-20'])
        ->assertUnprocessable()->assertJsonValidationErrors('batch_no');

    postTx(['transaction_type' => 'loss', 'quantity' => 60, 'expiry_date' => null, 'transaction_date' => '2026-09-20', 'comments' => 'Expired'])
        ->assertCreated()->assertJsonPath('data.running_balance', 0);
});

it('rejects back-dated and future-dated entries', function () {
    Sanctum::actingAs($this->staff);
    postTx(['transaction_date' => '2026-09-10']);

    postTx(['transaction_date' => '2026-09-09'])
        ->assertUnprocessable()->assertJsonValidationErrors('transaction_date');
    postTx(['transaction_date' => '2026-09-10'])->assertCreated(); // same day is fine
    postTx(['transaction_date' => '2026-09-27'])
        ->assertUnprocessable()->assertJsonValidationErrors('transaction_date');
});

it('requires counterparty only when stock moves to or from someone', function () {
    Sanctum::actingAs($this->staff);

    postTx(['counterparty' => null])->assertUnprocessable()->assertJsonValidationErrors('counterparty');
    postTx();
    postTx(['transaction_type' => 'loss', 'quantity' => 1, 'counterparty' => null, 'expiry_date' => null])->assertCreated();
});

it('validates the basic shape', function () {
    Sanctum::actingAs($this->staff);

    postTx(['transaction_type' => 'adjustment', 'quantity' => 0, 'transaction_date' => '01/09/2026', 'product_id' => 999])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['transaction_type', 'quantity', 'transaction_date', 'product_id'])
        ->assertJsonStructure(['message', 'errors']);
});

describe('authorization', function () {
    it('rejects unauthenticated requests with JSON 401', function () {
        $this->post("/api/v1/facilities/{$this->facility->id}/stock-transactions", [])
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);
    });

    it('stops sdp_staff recording at another facility, before validating anything', function () {
        Sanctum::actingAs($this->staff);

        postTx(['product_id' => 999], $this->otherFacility)->assertForbidden();
        expect(StockTransaction::count())->toBe(0);
    });

    it('stops officers recording anywhere', function (string $state) {
        Sanctum::actingAs(User::factory()->{$state}($this->lga->{$state === 'lgaOfficer' ? 'id' : 'state_id'})->create());

        postTx()->assertForbidden();
    })->with(['lgaOfficer', 'stateOfficer']);

    it('stops federal officers recording', function () {
        Sanctum::actingAs(User::factory()->create());

        postTx()->assertForbidden();
    });

    it('lets admins record at any facility', function () {
        Sanctum::actingAs(User::factory()->admin()->create());

        postTx([], $this->otherFacility)->assertCreated();
    });

    it('refuses writes to inactive facilities', function () {
        $this->facility->update(['is_active' => false]);
        Sanctum::actingAs($this->staff);

        postTx()->assertForbidden()->assertJson(['message' => 'This facility is inactive.']);
    });

    it('returns 404 for an unknown facility', function () {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/v1/facilities/999/stock-transactions', [])->assertNotFound();
    });
});

it('treats the ledger as append-only', function () {
    Sanctum::actingAs($this->staff);
    postTx();

    expect(fn () => StockTransaction::first()->update(['quantity' => 1]))->toThrow(LogicException::class)
        ->and(fn () => StockTransaction::first()->delete())->toThrow(LogicException::class);
});
