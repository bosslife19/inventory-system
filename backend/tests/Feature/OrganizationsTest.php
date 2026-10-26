<?php

use App\Contracts\PushSender;
use App\Enums\Plan;
use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Models\AuditEvent;
use App\Models\Facility;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\StockLedgerService;
use App\Support\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-21 10:00:00');
    $this->h = hierarchyFixture(); // the first organization, on the paid plan
    $this->home = Organization::query()->orderBy('id')->firstOrFail();
    $this->owner = User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null]);

    // A second organization in the same LGA, with its own facility, product and people.
    $this->other = Organization::create(['name' => 'Other Partner', 'plan' => Plan::Paid]);
    Facility::ensureStores($this->other->id);
    Tenant::run($this->other, function () {
        $this->otherFacility = Facility::create(['lga_id' => $this->h['lgas']['kadunaNorth']->id, 'name' => 'Kawo PHC', 'type' => 'health_center']);
        $this->otherProduct = Product::create([
            'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
            'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
        ]);
        $this->otherAdmin = User::factory()->admin()->create();
        $this->otherLga = User::factory()->lgaOfficer($this->h['lgas']['kadunaNorth']->id)->create(['fcm_token' => 'other-lga-phone']);
    });

    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->push = new class implements PushSender
    {
        public array $tokens = [];

        public function send(array $tokens, string $title, string $body, array $data = []): array
        {
            array_push($this->tokens, ...$tokens);

            return [];
        }
    };
    app()->instance(PushSender::class, $this->push);
});

// ------------------------------------------------------------------ isolation

it('keeps every organization to its own facilities, stores, catalog and accounts', function () {
    $lga = $this->h['lgas']['kadunaNorth'];
    $mine = $this->h['facilities']['kawo'];

    $this->actingAs($this->h['users']['admin']);
    $this->getJson("/api/v1/lgas/{$lga->id}/facilities")->assertOk()
        ->assertJsonMissing(['id' => $this->otherFacility->id]);
    $this->getJson("/api/v1/facilities/{$this->otherFacility->id}")->assertNotFound();
    $this->getJson("/api/v1/facilities/{$this->otherFacility->id}/stock-balances")->assertNotFound();
    $this->putJson("/api/v1/products/{$this->otherProduct->id}", ['name' => 'Mine now'])->assertNotFound();
    expect(collect($this->getJson('/api/v1/products')->json('data'))->pluck('id')->all())->toBe([$this->ors->id]);
    expect(collect($this->getJson('/api/v1/users')->json('data'))->pluck('id'))
        ->not->toContain($this->otherAdmin->id)->not->toContain($this->otherLga->id);
    $this->putJson("/api/v1/users/{$this->otherAdmin->id}", ['is_active' => false])->assertNotFound();

    // Another organization's product can't go on my Stock Card.
    $this->postJson("/api/v1/facilities/{$mine->id}/stock-transactions", [
        'product_id' => $this->otherProduct->id, 'transaction_type' => 'receipt', 'quantity' => 5,
        'transaction_date' => '2026-10-20', 'counterparty' => 'CMS',
    ])->assertUnprocessable()->assertJsonValidationErrors('product_id');

    // Each organization has its own LGA store, and its officers keep only that one.
    $theirStore = Facility::storeForLga($lga, $this->other->id);
    expect($theirStore->id)->not->toBe(Facility::storeForLga($lga)->id);
    $this->actingAs($this->h['users']['lga']);
    $this->getJson('/api/v1/auth/me')->assertJsonPath('data.store.id', Facility::storeForLga($lga)->id);
    $this->getJson("/api/v1/facilities/{$theirStore->id}")->assertNotFound();
    $this->getJson("/api/v1/lgas/{$lga->id}/stock-summary")->assertOk()
        ->assertJsonMissing(['id' => $this->otherFacility->id]);
});

it('lets two organizations use the same product code and facility name', function () {
    $this->actingAs($this->otherAdmin)->postJson('/api/v1/products', [
        'name' => 'Zinc', 'sku' => 'ZNC', 'category' => 'Diarrhoea', 'unit_of_measure' => 'pack', 'pack_size' => 10,
        'requires_batch_tracking' => false, 'requires_cold_chain' => false, 'min_stock_level' => 20, 'max_stock_level' => 40, 'reorder_level' => 10,
    ])->assertCreated();
    expect($this->otherProduct->sku)->toBe($this->ors->sku)
        ->and($this->otherFacility->name)->toBe($this->h['facilities']['kawo']->name);
});

it('tells only the organization that keeps the store about its alerts, and keeps audit logs apart', function () {
    $this->h['users']['lga']->update(['fcm_token' => 'my-lga-phone']);
    $store = Facility::storeForLga($this->h['lgas']['kadunaNorth']);
    app(StockLedgerService::class)->record($store, $this->ors, TransactionType::Receipt, 5, CarbonImmutable::today(), $this->h['users']['admin'], counterparty: 'CMS');

    expect($this->push->tokens)->toBe(['my-lga-phone'])
        ->and(UserNotification::where('user_id', $this->otherLga->id)->exists())->toBeFalse();

    $this->actingAs($this->otherAdmin);
    expect($this->getJson('/api/v1/audit-events')->assertOk()->json('data'))->each(fn ($e) => $e->summary->not->toContain('ORS'));
    expect(AuditEvent::withoutGlobalScopes()->where('organization_id', $this->home->id)->exists())->toBeTrue();
});

it('never lets an organization admin make a platform owner', function () {
    $this->actingAs($this->h['users']['admin'])->postJson('/api/v1/users', [
        'name' => 'Sneaky', 'email' => 'sneaky@example.test', 'role' => 'owner',
    ])->assertUnprocessable();
});

// ------------------------------------------------------------------ the paid plan

it('locks the paid features on the free plan, and leaves the Stock Card and dashboards free', function () {
    $this->home->update(['plan' => Plan::Free]);
    $kawo = $this->h['facilities']['kawo'];
    $lga = $this->h['lgas']['kadunaNorth'];

    $this->actingAs($this->h['users']['lga']);
    $this->getJson("/api/v1/lgas/{$lga->id}/stock-summary")->assertOk();
    $this->actingAs($this->h['users']['state'])->getJson("/api/v1/states/{$this->h['states']['kaduna']->id}/stock-summary")->assertOk();
    $this->actingAs($this->h['users']['federal'])->getJson('/api/v1/federal/stock-summary')->assertOk();
    $this->actingAs($this->h['users']['lga']);
    $store = Facility::storeForLga($lga);
    $this->getJson("/api/v1/facilities/{$store->id}/dispatch-destinations")->assertStatus(402)->assertJsonPath('feature', 'supply_chain');

    $this->actingAs($this->h['users']['sdp']);
    $this->postJson("/api/v1/facilities/{$kawo->id}/reorder-requests", [])->assertStatus(402);
    $this->postJson("/api/v1/facilities/{$kawo->id}/delivery-notes", [])->assertStatus(402)->assertJsonPath('feature', 'delivery_scanning');
    $this->postJson("/api/v1/facilities/{$kawo->id}/stock-transactions", [
        'product_id' => $this->ors->id, 'transaction_type' => 'receipt', 'quantity' => 5,
        'transaction_date' => '2026-10-20', 'counterparty' => 'CMS',
    ])->assertCreated();
    $this->getJson("/api/v1/reports/stock-status?area=facility&id={$kawo->id}")->assertOk();

    $this->actingAs($this->h['users']['admin']);
    $csv = UploadedFile::fake()->createWithContent('p.csv', "product_code,name\nX,Y\n");
    $this->post('/api/v1/imports/products', ['file' => $csv, 'dry_run' => true], ['Accept' => 'application/json'])
        ->assertStatus(402)->assertJsonPath('feature', 'bulk_imports');
});

it('sends no push on the free plan, but still the in-app notification', function () {
    $this->home->update(['plan' => Plan::Free]);
    $this->h['users']['sdp']->update(['fcm_token' => 'kawo-phone']);
    $rec = fn (TransactionType $type, int $qty) => app(StockLedgerService::class)->record(
        $this->h['facilities']['kawo'], $this->ors, $type, $qty, CarbonImmutable::today(), $this->h['users']['admin'], counterparty: 'CMS');
    $rec(TransactionType::Receipt, 50);
    $rec(TransactionType::Issue, 50);

    expect($this->push->tokens)->toBe([])
        ->and(UserNotification::where('user_id', $this->h['users']['sdp']->id)->whereNull('pushed_at')->count())->toBe(1);
});

it('runs a paid plan to its last day, warning before it ends, then falls back to free', function () {
    $this->home->update(['plan' => Plan::Paid, 'paid_until' => '2026-10-30']);
    // Each request reads the organization afresh, as a real one would.
    $me = fn () => $this->actingAs($this->h['users']['lga']->unsetRelation('organization'))->getJson('/api/v1/auth/me')->assertOk();
    $me()->assertJsonPath('data.organization.plan', 'paid')
        ->assertJsonPath('data.organization.days_left', 10)
        ->assertJsonPath('data.organization.renewal_due', true)
        ->assertJsonPath('data.organization.features', ['bulk_imports', 'delivery_scanning', 'multiple_accounts', 'multiple_facilities', 'push_notifications', 'supply_chain']);

    $this->home->update(['paid_until' => '2026-12-31']);
    $me()->assertJsonPath('data.organization.renewal_due', false);

    CarbonImmutable::setTestNow('2027-01-01 08:00:00'); // Lagos: the day after
    $me()->assertJsonPath('data.organization.plan', 'free')
        ->assertJsonPath('data.organization.features', [])
        ->assertJsonPath('data.organization.days_left', null);
    $this->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}/reorder-suppliers")->assertStatus(402);
});

it('allows one active account per role on the free plan', function () {
    $this->home->update(['plan' => Plan::Free]);
    $this->actingAs($this->h['users']['admin']);
    $add = fn (string $email, string $role, array $node = []) => $this->postJson('/api/v1/users', ['name' => 'New', 'email' => $email, 'role' => $role, ...$node]);

    // The fixture already has one of each role (federal, state, LGA, facility staff, admin), and clients are told so.
    $this->getJson('/api/v1/auth/me')->assertJsonPath('data.organization.limits', [
        'roles_in_use' => ['admin', 'federal_officer', 'lga_officer', 'sdp_staff', 'state_officer'], 'facility_in_use' => true,
        'max_accounts' => null, 'accounts_in_use' => 5, 'max_facilities' => 1, 'facilities_in_use' => 4,
    ]);
    $add('admin2@example.test', 'admin')->assertStatus(402)
        ->assertJson(['code' => 'feature_unavailable', 'feature' => 'multiple_accounts']);
    $add('fed2@example.test', 'federal_officer')->assertStatus(402);
    $add('state2@example.test', 'state_officer', ['state_id' => $this->h['states']['lagos']->id])->assertStatus(402);
    $add('lga2@example.test', 'lga_officer', ['lga_id' => $this->h['lgas']['zaria']->id])->assertStatus(402);
    $add('sdp2@example.test', 'sdp_staff', ['facility_id' => $this->h['facilities']['kawo']->id])->assertStatus(402);

    // Deactivating frees the slot; reactivating the old one is then refused.
    $old = $this->h['users']['federal'];
    $this->putJson("/api/v1/users/{$old->id}", ['is_active' => false])->assertOk();
    $add('fed2@example.test', 'federal_officer')->assertCreated();
    $this->putJson("/api/v1/users/{$old->id}", ['is_active' => true])->assertStatus(402);
    // Nor can an account move into a role that's taken.
    $this->putJson("/api/v1/users/{$this->h['users']['lga']->id}", ['role' => 'state_officer', 'state_id' => $this->h['states']['lagos']->id])->assertStatus(402);
    // Editing an account without touching its role is fine.
    $this->putJson("/api/v1/users/{$this->h['users']['lga']->id}", ['name' => 'Renamed'])->assertOk();

    $this->home->update(['plan' => Plan::Paid]);
    $this->actingAs($this->h['users']['admin']->unsetRelation('organization'));
    $this->getJson('/api/v1/auth/me')->assertJsonPath('data.organization.limits', null);
    $add('admin2@example.test', 'admin')->assertCreated();
});

it('allows one open facility on the free plan', function () {
    $this->home->update(['plan' => Plan::Free]);
    $this->actingAs($this->h['users']['admin']);
    $lga = $this->h['lgas']['kadunaNorth'];
    $new = fn (string $name) => $this->postJson('/api/v1/facilities', ['lga_id' => $lga->id, 'name' => $name, 'type' => 'health_center']);

    $new('Another PHC')->assertStatus(402)->assertJsonPath('feature', 'multiple_facilities');

    // Close all but Kawo: still one open, so still refused; close Kawo too and one can be added.
    foreach (['rimi', 'tudun', 'ikejaGh'] as $key) {
        $this->putJson("/api/v1/facilities/{$this->h['facilities'][$key]->id}", ['is_active' => false])->assertOk();
    }
    $new('Another PHC')->assertStatus(402);
    $this->putJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}", ['is_active' => false])->assertOk();
    $new('Another PHC')->assertCreated();
    // ... and Kawo can't reopen alongside it.
    $this->putJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}", ['is_active' => true])->assertStatus(402);
});

// ------------------------------------------------------------------ the owner's console

it('lets the owner set up an organization with its stores, logo and first admin', function () {
    Storage::fake('local');
    $this->actingAs($this->owner);

    $res = $this->postJson('/api/v1/owner/organizations', [
        'name' => 'Lagos Health Trust', 'contact_email' => 'ops@lht.test', 'plan' => 'paid', 'paid_until' => '2027-10-20',
        'notes' => 'Paid by transfer, INV-001', 'admin' => ['name' => 'Ada Admin', 'email' => 'ada@lht.test'],
    ])->assertCreated()
        ->assertJsonPath('data.name', 'Lagos Health Trust')
        ->assertJsonPath('data.effective_plan', 'paid')
        ->assertJsonPath('admin.email', 'ada@lht.test')
        ->assertJsonPath('admin.role', 'admin');
    $org = Organization::findOrFail($res->json('data.id'));
    $password = $res->json('temporary_password');
    expect($password)->toBeString()
        ->and(Facility::withoutGlobalScopes()->where('organization_id', $org->id)->where('store_level', 'lga')->count())->toBe(3);

    $this->post("/api/v1/owner/organizations/{$org->id}/logo", ['logo' => UploadedFile::fake()->image('logo.png', 200, 80)], ['Accept' => 'application/json'])
        ->assertOk();
    $logoUrl = $org->refresh()->logoUrl();
    expect($logoUrl)->toContain("/api/v1/organizations/{$org->id}/logo/");
    $this->post("/api/v1/owner/organizations/{$org->id}/logo", ['logo' => UploadedFile::fake()->create('logo.svg', 2, 'image/svg+xml')], ['Accept' => 'application/json'])
        ->assertUnprocessable();

    // The admin signs in with what the owner sends them, and sees their organization's logo.
    Tenant::set(null); // as outside any request
    app('auth')->forgetGuards();
    $token = $this->postJson('/api/v1/auth/login', ['email' => 'ada@lht.test', 'password' => $password])->assertOk()->json('data.token');
    $this->withToken($token)->getJson('/api/v1/auth/me')
        ->assertJsonPath('data.organization.name', 'Lagos Health Trust')
        ->assertJsonPath('data.organization.logo_url', $logoUrl)
        ->assertJsonMissingPath('data.organization.notes');
    $this->get(parse_url($logoUrl, PHP_URL_PATH))->assertOk();
});

it('lets the owner renew, suspend and look after admins, and nothing else', function () {
    $this->actingAs($this->owner);
    $this->getJson('/api/v1/owner/organizations')->assertOk()->assertJsonCount(2, 'data');
    $this->putJson("/api/v1/owner/organizations/{$this->other->id}", ['plan' => 'paid', 'paid_until' => '2027-10-31'])
        ->assertOk()->assertJsonPath('data.paid_until', '2027-10-31');

    $this->postJson("/api/v1/owner/organizations/{$this->other->id}/admins/{$this->otherAdmin->id}/reset-password")
        ->assertOk()->assertJsonStructure(['temporary_password']);
    // Only that organization's admins: not its other accounts, not another organization's.
    $this->postJson("/api/v1/owner/organizations/{$this->other->id}/admins/{$this->otherLga->id}/reset-password")->assertNotFound();
    $this->postJson("/api/v1/owner/organizations/{$this->other->id}/admins/{$this->h['users']['admin']->id}/reset-password")->assertNotFound();

    // The owner sees no organization's data.
    $this->getJson('/api/v1/products')->assertForbidden()->assertJsonPath('code', 'owner_account');
    $this->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}")->assertForbidden();

    // Nobody else reaches the console.
    $this->actingAs($this->h['users']['admin'])->getJson('/api/v1/owner/organizations')->assertForbidden();

    // Suspending an organization shuts its members out at once.
    $this->actingAs($this->owner)->putJson("/api/v1/owner/organizations/{$this->other->id}", ['is_active' => false])->assertOk();
    $this->actingAs($this->otherAdmin->refresh())->getJson('/api/v1/products')->assertUnauthorized()->assertJsonPath('code', 'organization_inactive');
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/auth/login', ['email' => $this->otherAdmin->email, 'password' => 'password'])
        ->assertUnprocessable()->assertJsonValidationErrors('email');
});

it('shows the platform branding to everyone, and lets the owner change it', function () {
    Storage::fake('local');
    $this->getJson('/api/v1/platform')->assertOk()->assertJsonPath('data.name', 'Stock Card')->assertJsonPath('data.logo_url', null);

    $this->actingAs($this->owner)->putJson('/api/v1/owner/platform', ['name' => 'Okoro Health Systems', 'tagline' => 'Supply chain visibility'])->assertOk();
    $this->post('/api/v1/owner/platform/logo', ['logo' => UploadedFile::fake()->image('me.png', 100, 100)], ['Accept' => 'application/json'])->assertOk();

    $branding = $this->getJson('/api/v1/platform')->assertJsonPath('data.name', 'Okoro Health Systems')->json('data');
    $this->get(parse_url($branding['logo_url'], PHP_URL_PATH))->assertOk();
    $this->get('/api/v1/platform/logo/not-the-file.png')->assertNotFound();

    $this->actingAs($this->h['users']['admin'])->putJson('/api/v1/owner/platform', ['name' => 'Mine'])->assertForbidden();
});

// ------------------------------------------------------------------ sign-up

it('lets anyone sign up a new organization on the free plan, as its admin, until the owner upgrades it', function () {
    Tenant::set(null); // as a real request starts: no organization until the token's user is known
    $response = $this->postJson('/api/v1/auth/register', [
        'organization_name' => 'Kano Health Trust', 'name' => 'Amina Bello', 'email' => 'amina@trust.test',
        'phone' => '08030000000', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertCreated()
        ->assertJsonPath('data.user.role', 'admin')
        ->assertJsonPath('data.user.must_change_password', false)
        ->assertJsonPath('data.user.organization.plan', 'free')
        ->assertJsonPath('data.user.organization.features', []);

    $org = Organization::query()->where('name', 'Kano Health Trust')->firstOrFail();
    expect($org->plan)->toBe(Plan::Free)
        ->and($org->contact_email)->toBe('amina@trust.test')
        ->and(Facility::withoutGlobalScopes()->where('organization_id', $org->id)->whereNotNull('store_level')->count())->toBeGreaterThan(0);

    // Signed in straight away, and fenced into the new organization.
    $token = $response->json('data.token');
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.organization.id', $org->id);
    $this->withToken($token)->getJson("/api/v1/facilities/{$this->h['facilities']['kawo']->id}")->assertNotFound();

    // The owner sees it and upgrades it once paid.
    $this->actingAs($this->owner);
    $this->getJson('/api/v1/owner/organizations')->assertOk()->assertJsonFragment(['name' => 'Kano Health Trust']);
    $this->putJson("/api/v1/owner/organizations/{$org->id}", ['plan' => 'paid', 'paid_until' => '2027-10-21'])
        ->assertOk()->assertJsonPath('data.effective_plan', 'paid');
});

it('refuses a sign-up with an email already in use or a short password', function () {
    $this->postJson('/api/v1/auth/register', [
        'organization_name' => 'Dup', 'name' => 'X', 'email' => $this->h['users']['lga']->email,
        'password' => 'short', 'password_confirmation' => 'short',
    ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);

    expect(Organization::query()->where('name', 'Dup')->exists())->toBeFalse();
});
