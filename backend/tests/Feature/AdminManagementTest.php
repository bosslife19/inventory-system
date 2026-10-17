<?php

use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\Product;
use App\Models\User;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->u = $this->h['users'];
});

// ---------------------------------------------------------------- accounts

it('lets each level manage the accounts one level below, in its area', function () {
    $f = $this->h['facilities'];
    $staff = fn (Facility $at) => ['name' => 'New Staff', 'email' => "staff{$at->id}@x.test", 'role' => 'sdp_staff', 'facility_id' => $at->id];

    $this->actingAs($this->u['lga'], 'sanctum');
    $this->postJson('/api/v1/users', $staff($f['rimi']))->assertCreated()->assertJsonPath('data.node.name', 'Rimi PHC');
    $this->postJson('/api/v1/users', $staff($f['tudun']))->assertUnprocessable()->assertJsonValidationErrors('facility_id');
    $this->postJson('/api/v1/users', $staff(Facility::storeForLga($this->h['lgas']['kadunaNorth'])))->assertUnprocessable()->assertJsonValidationErrors('facility_id');
    $this->postJson('/api/v1/users', ['name' => 'X', 'email' => 'x@x.test', 'role' => 'lga_officer', 'lga_id' => $this->h['lgas']['kadunaNorth']->id])
        ->assertUnprocessable()->assertJsonValidationErrors('role');

    $this->actingAs($this->u['state'], 'sanctum');
    $this->postJson('/api/v1/users', ['name' => 'Zaria Officer', 'email' => 'zaria@x.test', 'role' => 'lga_officer', 'lga_id' => $this->h['lgas']['zaria']->id])->assertCreated();
    $this->postJson('/api/v1/users', ['name' => 'Ikeja Officer', 'email' => 'ikeja@x.test', 'role' => 'lga_officer', 'lga_id' => $this->h['lgas']['ikeja']->id])
        ->assertUnprocessable()->assertJsonValidationErrors('lga_id');

    $this->actingAs($this->u['federal'], 'sanctum');
    $this->postJson('/api/v1/users', ['name' => 'Lagos Officer', 'email' => 'lagos@x.test', 'role' => 'state_officer', 'state_id' => $this->h['states']['lagos']->id])->assertCreated();

    $this->actingAs($this->u['sdp'], 'sanctum');
    $this->postJson('/api/v1/users', $staff($f['kawo']))->assertForbidden();
    $this->getJson('/api/v1/users')->assertForbidden();

    $this->actingAs($this->u['admin'], 'sanctum');
    $this->postJson('/api/v1/users', ['name' => 'Second Admin', 'email' => 'admin2@x.test', 'role' => 'admin'])->assertCreated()
        ->assertJsonPath('data.facility_id', null);
});

it('lists only the accounts the caller manages', function () {
    $names = fn (User $as) => collect($this->actingAs($as, 'sanctum')->getJson('/api/v1/users')->assertOk()->json('data'))->pluck('id')->all();

    // Another facility's staff, outside the LGA officer's area.
    $tudunStaff = User::factory()->sdpStaff($this->h['facilities']['tudun']->id)->create();

    expect($names($this->u['lga']))->toBe([$this->u['sdp']->id])
        ->and($names($this->u['state']))->toBe([$this->u['lga']->id])
        ->and($names($this->u['federal']))->toBe([$this->u['state']->id])
        ->and($names($this->u['admin']))->toContain($tudunStaff->id, $this->u['federal']->id)
        ->not->toContain($this->u['admin']->id);

    $this->actingAs($this->u['admin'], 'sanctum')
        ->getJson('/api/v1/users?role=sdp_staff&q='.urlencode($tudunStaff->email))
        ->assertJsonPath('meta.pagination.total', 1);
});

it('creates accounts on a temporary password that must be changed first', function () {
    $this->actingAs($this->u['lga'], 'sanctum');
    $res = $this->postJson('/api/v1/users', [
        'name' => 'Amina Bello', 'email' => ' Amina@Kawo.test ', 'role' => 'sdp_staff', 'facility_id' => $this->h['facilities']['kawo']->id,
    ])->assertCreated()->assertJsonPath('data.must_change_password', true)->assertJsonPath('data.email', 'amina@kawo.test');
    $temporary = $res->json('temporary_password');
    expect($temporary)->toHaveLength(10);

    // Sign in with it: only /auth/me, /auth/password and logout work until it's changed.
    $token = $this->postJson('/api/v1/auth/login', ['email' => 'amina@kawo.test', 'password' => $temporary])->assertOk()->json('data.token');
    app('auth')->forgetGuards();
    $auth = ['Authorization' => "Bearer {$token}"];
    $this->getJson('/api/v1/auth/me', $auth)->assertOk()->assertJsonPath('data.must_change_password', true);
    $this->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}/stock-balances", $auth)
        ->assertForbidden()->assertJsonPath('code', 'password_change_required');

    $this->postJson('/api/v1/auth/password', ['current_password' => 'wrong', 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1'], $auth)
        ->assertUnprocessable()->assertJsonValidationErrors('current_password');
    $this->postJson('/api/v1/auth/password', ['current_password' => $temporary, 'password' => $temporary, 'password_confirmation' => $temporary], $auth)
        ->assertUnprocessable()->assertJsonValidationErrors('password');
    $this->postJson('/api/v1/auth/password', ['current_password' => $temporary, 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1'], $auth)
        ->assertOk()->assertJsonPath('data.must_change_password', false);

    app('auth')->forgetGuards();
    $this->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}/stock-balances", $auth)->assertOk();
    expect(Hash::check('new-secret-1', User::where('email', 'amina@kawo.test')->value('password')))->toBeTrue();
});

it('deactivates accounts instead of deleting them, signing them out everywhere', function () {
    $staff = $this->u['sdp'];
    $token = $staff->createToken('phone')->plainTextToken;
    $staff->update(['fcm_token' => 'abc']);

    $this->actingAs($this->u['lga'], 'sanctum')
        ->putJson("/api/v1/users/{$staff->id}", ['is_active' => false])
        ->assertOk()->assertJsonPath('data.is_active', false);

    expect($staff->tokens()->count())->toBe(0)->and($staff->fresh()->fcm_token)->toBeNull();
    app('auth')->forgetGuards();
    $this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$token}"])->assertUnauthorized();
    $this->postJson('/api/v1/auth/login', ['email' => $staff->email, 'password' => 'password'])
        ->assertUnprocessable()->assertJsonValidationErrors('email');

    // Reactivate.
    $this->actingAs($this->u['lga'], 'sanctum')->putJson("/api/v1/users/{$staff->id}", ['is_active' => true])->assertOk();
    $this->postJson('/api/v1/auth/login', ['email' => $staff->email, 'password' => 'password'])->assertOk();
});

it('resets a password to a new temporary one', function () {
    $staff = $this->u['sdp'];
    $staff->createToken('phone');

    $temporary = $this->actingAs($this->u['lga'], 'sanctum')
        ->postJson("/api/v1/users/{$staff->id}/reset-password")
        ->assertOk()->assertJsonPath('data.must_change_password', true)
        ->json('temporary_password');

    expect($staff->tokens()->count())->toBe(0)
        ->and(Hash::check($temporary, $staff->fresh()->password))->toBeTrue();
});

it('moves staff within the area only, and never lets anyone manage themselves', function () {
    $staff = $this->u['sdp'];

    $this->actingAs($this->u['lga'], 'sanctum');
    $this->putJson("/api/v1/users/{$staff->id}", ['facility_id' => $this->h['facilities']['rimi']->id])->assertOk()->assertJsonPath('data.node.name', 'Rimi PHC');
    $this->putJson("/api/v1/users/{$staff->id}", ['facility_id' => $this->h['facilities']['tudun']->id])->assertUnprocessable()->assertJsonValidationErrors('facility_id');
    $this->putJson("/api/v1/users/{$staff->id}", ['role' => 'lga_officer', 'lga_id' => $this->h['lgas']['kadunaNorth']->id])->assertUnprocessable()->assertJsonValidationErrors('role');
    $this->putJson("/api/v1/users/{$this->u['lga']->id}", ['is_active' => false])->assertForbidden();
    $this->putJson("/api/v1/users/{$this->u['state']->id}", ['name' => 'Up the chain'])->assertForbidden();

    $this->actingAs($this->u['admin'], 'sanctum');
    $this->putJson("/api/v1/users/{$this->u['admin']->id}", ['is_active' => false])->assertForbidden();
    $this->putJson("/api/v1/users/{$staff->id}", ['role' => 'lga_officer', 'lga_id' => $this->h['lgas']['zaria']->id])
        ->assertOk()->assertJsonPath('data.facility_id', null)->assertJsonPath('data.lga_id', $this->h['lgas']['zaria']->id);
});

// ---------------------------------------------------------------- products

it('lets any level add products; only admins and the creator change them; EOP below min', function () {
    $body = [
        'name' => 'Paracetamol 500mg tablets', 'sku' => ' pcm-500 ', 'category' => 'Analgesics', 'unit_of_measure' => ' Pack ',
        'requires_batch_tracking' => true, 'requires_cold_chain' => false,
        'min_stock_level' => 20, 'reorder_level' => 10, 'max_stock_level' => 50,
    ];

    $this->actingAs($this->u['sdp'], 'sanctum');
    $this->postJson('/api/v1/products', $body)->assertUnprocessable()->assertJsonValidationErrors('pack_size');
    $this->postJson('/api/v1/products', [...$body, 'unit_of_measure' => 'crate', 'pack_size' => 10])
        ->assertUnprocessable()->assertJsonValidationErrors('unit_of_measure');
    $this->postJson('/api/v1/products', [...$body, 'pack_size' => 10, 'reorder_level' => 20])
        ->assertUnprocessable()->assertJsonValidationErrors('reorder_level'); // EOP must be below min
    $id = $this->postJson('/api/v1/products', [...$body, 'pack_size' => 10])->assertCreated()
        ->assertJsonPath('data.sku', 'PCM-500')->assertJsonPath('data.unit_of_measure', 'pack')->assertJsonPath('data.pack_size', 10)
        ->assertJsonPath('data.created_by', $this->u['sdp']->id)->assertJsonPath('data.is_active', true)->json('data.id');
    $this->postJson('/api/v1/products', [...$body, 'pack_size' => 10])->assertUnprocessable()->assertJsonValidationErrors('sku');
    $this->putJson("/api/v1/products/{$id}", ['pack_size' => 20])->assertOk()->assertJsonPath('data.pack_size', 20);
    $this->putJson("/api/v1/products/{$id}", ['pack_size' => null])->assertUnprocessable()->assertJsonValidationErrors('pack_size');
    $this->putJson("/api/v1/products/{$id}", ['unit_of_measure' => 'tablet', 'pack_size' => null])->assertOk()
        ->assertJsonPath('data.unit_of_measure', 'tablet')->assertJsonPath('data.pack_size', null);

    $this->actingAs($this->u['federal'], 'sanctum')->putJson("/api/v1/products/{$id}", ['max_stock_level' => 80])->assertForbidden();

    $this->actingAs($this->u['admin'], 'sanctum');
    $this->putJson("/api/v1/products/{$id}", ['reorder_level' => 25])->assertUnprocessable()->assertJsonValidationErrors('reorder_level');
    $this->putJson("/api/v1/products/{$id}", ['max_stock_level' => 15])->assertUnprocessable()->assertJsonValidationErrors('max_stock_level');
    $this->putJson("/api/v1/products/{$id}", ['max_stock_level' => 80, 'is_active' => false])->assertOk()
        ->assertJsonPath('data.max_stock_level', 80)->assertJsonPath('data.is_active', false);
});

it('freezes batch tracking once a product has Stock Card entries', function () {
    $this->actingAs($this->u['admin'], 'sanctum');
    $product = Product::create([
        'name' => 'Gloves', 'sku' => 'GLV', 'category' => 'Consumables', 'unit_of_measure' => 'box', 'pack_size' => 100,
        'requires_batch_tracking' => false, 'min_stock_level' => 2, 'max_stock_level' => 10, 'reorder_level' => 1,
    ]);
    $this->putJson("/api/v1/products/{$product->id}", ['requires_batch_tracking' => true])->assertOk();
    $this->putJson("/api/v1/products/{$product->id}", ['requires_batch_tracking' => false])->assertOk();

    app(StockLedgerService::class)->record(
        facility: $this->h['facilities']['kawo'], product: $product->fresh(), type: TransactionType::Receipt, quantity: 5,
        transactionDate: CarbonImmutable::parse('2026-09-25'), performedBy: $this->u['admin'], counterparty: 'Supplier',
    );
    $this->putJson("/api/v1/products/{$product->id}", ['requires_batch_tracking' => true])
        ->assertUnprocessable()->assertJsonValidationErrors('requires_batch_tracking');
});

// ---------------------------------------------------------------- facilities

it('lets only admins add and change facilities, never stores', function () {
    $lga = $this->h['lgas']['zaria'];
    $body = ['lga_id' => $lga->id, 'name' => 'Sabon Gari PHC', 'type' => 'health_center', 'phone' => '0800'];

    $this->actingAs($this->u['state'], 'sanctum')->postJson('/api/v1/facilities', $body)->assertForbidden();

    $this->actingAs($this->u['admin'], 'sanctum');
    $id = $this->postJson('/api/v1/facilities', $body)->assertCreated()
        ->assertJsonPath('data.lga.name', 'Zaria')->assertJsonPath('data.store_level', null)->json('data.id');
    $this->postJson('/api/v1/facilities', $body)->assertUnprocessable()->assertJsonValidationErrors('name');
    $this->putJson("/api/v1/facilities/{$id}", ['lga_id' => $this->h['lgas']['ikeja']->id])->assertUnprocessable()->assertJsonValidationErrors('lga_id');
    $this->putJson("/api/v1/facilities/{$id}", ['name' => 'Sabon Gari Comprehensive HC', 'is_active' => false])->assertOk()
        ->assertJsonPath('data.is_active', false);
    $this->putJson('/api/v1/facilities/'.Facility::storeForLga($lga)->id, ['name' => 'Renamed'])->assertForbidden();

    $this->getJson("/api/v1/lgas/{$lga->id}/facilities")->assertJsonFragment(['name' => 'Sabon Gari Comprehensive HC']);
});
