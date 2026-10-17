<?php

use App\Enums\TransactionType;
use App\Models\AuditEvent;
use App\Models\Facility;
use App\Models\Product;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-09-26 10:00:00');
    $this->h = hierarchyFixture();
    $this->f = $this->h['facilities'];
    $this->u = $this->h['users'];
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS-LO', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->receive = fn (Facility $f, int $qty) => app(StockLedgerService::class)->record(
        facility: $f, product: $this->ors, type: TransactionType::Receipt, quantity: $qty,
        transactionDate: CarbonImmutable::parse('2026-09-25'), performedBy: $this->u['admin'], counterparty: 'CMS',
    );
});

it('logs every Stock Card entry with who, what and where', function () {
    $this->actingAs($this->u['sdp'], 'sanctum')->postJson("/api/v1/facilities/{$this->f['kawo']->id}/stock-transactions", [
        'product_id' => $this->ors->id, 'transaction_type' => 'receipt', 'quantity' => 40,
        'counterparty' => 'Kaduna CMS', 'voucher_no' => 'SRV-9', 'transaction_date' => '2026-09-26',
    ])->assertCreated();

    $event = AuditEvent::sole();
    expect($event->action)->toBe('stock.recorded')
        ->and($event->actor_id)->toBe($this->u['sdp']->id)
        ->and($event->summary)->toBe('Receipt 40 × ORS-LO from Kaduna CMS — balance 40')
        ->and([$event->facility_id, $event->lga_id, $event->state_id])
        ->toBe([$this->f['kawo']->id, $this->h['lgas']['kadunaNorth']->id, $this->h['states']['kaduna']->id]);

    $this->getJson('/api/v1/audit-events')->assertOk()
        ->assertJsonPath('data.0.category', 'stock')
        ->assertJsonPath('data.0.actor.name', $this->u['sdp']->name)
        ->assertJsonPath('data.0.place.facility', 'Kawo PHC')
        ->assertJsonPath('data.0.place.state', 'Kaduna');
});

it('shows each person only the activity in their own area', function () {
    ($this->receive)($this->f['kawo'], 10);
    ($this->receive)($this->f['rimi'], 20);
    ($this->receive)($this->f['tudun'], 30);   // Zaria
    ($this->receive)($this->f['ikejaGh'], 40); // Lagos
    ($this->receive)(Facility::storeForLga($this->h['lgas']['kadunaNorth']), 50);

    $seen = fn ($user) => collect($this->actingAs($user, 'sanctum')->getJson('/api/v1/audit-events?category=stock')->assertOk()->json('data'))
        ->pluck('place.facility')->sort()->values()->all();

    expect($seen($this->u['sdp']))->toBe(['Kawo PHC'])
        ->and($seen($this->u['lga']))->toBe(['Kaduna North LGA Store', 'Kawo PHC', 'Rimi PHC'])
        ->and($seen($this->u['state']))->toBe(['Kaduna North LGA Store', 'Kawo PHC', 'Rimi PHC', 'Tudun Wada PHC'])
        ->and($seen($this->u['federal']))->toHaveCount(5);
});

it('logs account changes without ever recording passwords', function () {
    $this->actingAs($this->u['lga'], 'sanctum');
    $id = $this->postJson('/api/v1/users', ['name' => 'Amina', 'email' => 'amina@x.test', 'role' => 'sdp_staff', 'facility_id' => $this->f['rimi']->id])
        ->assertCreated()->json('data.id');
    $this->putJson("/api/v1/users/{$id}", ['name' => 'Amina Bello'])->assertOk();
    $this->putJson("/api/v1/users/{$id}", ['is_active' => false])->assertOk();
    $this->postJson("/api/v1/users/{$id}/reset-password")->assertOk();

    $events = AuditEvent::where('subject_type', 'user')->where('subject_id', $id)->orderBy('id')->get();
    expect($events->pluck('action')->all())->toBe(['user.created', 'user.updated', 'user.deactivated', 'user.password_reset'])
        ->and($events[0]->summary)->toBe('Account created for Amina (amina@x.test) as facility staff at Rimi PHC')
        ->and($events[1]->changes)->toBe(['name' => ['Amina', 'Amina Bello']])
        ->and($events[2]->changes)->toBe(['is_active' => [true, false]])
        ->and($events->every(fn ($e) => $e->actor_id === $this->u['lga']->id && $e->facility_id === $this->f['rimi']->id))->toBeTrue()
        ->and(json_encode($events->pluck('changes')))->not->toContain('password');

    // Signing in and choosing a password are logged against the person themselves.
    $this->u['sdp']->update(['must_change_password' => true]);
    $token = $this->postJson('/api/v1/auth/login', ['email' => $this->u['sdp']->email, 'password' => 'password'])->json('data.token');
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/auth/password', ['current_password' => 'password', 'password' => 'new-pass-123', 'password_confirmation' => 'new-pass-123'], ['Authorization' => "Bearer {$token}"])->assertOk();
    expect(AuditEvent::where('actor_id', $this->u['sdp']->id)->orderBy('id')->pluck('summary')->all())->toBe([
        "{$this->u['sdp']->name} signed in (web)",
        "{$this->u['sdp']->name} set their own password, replacing a temporary one",
    ]);
});

it('logs catalog and facility edits with before and after, catalog nationally only', function () {
    $this->actingAs($this->u['admin'], 'sanctum');
    $this->putJson("/api/v1/products/{$this->ors->id}", ['max_stock_level' => 120, 'is_active' => true])->assertOk();
    $this->putJson("/api/v1/products/{$this->ors->id}", ['is_active' => false])->assertOk();
    $this->putJson("/api/v1/facilities/{$this->f['rimi']->id}", ['phone' => '0803'])->assertOk();

    $events = AuditEvent::orderBy('id')->get();
    expect($events->pluck('action')->all())->toBe(['product.updated', 'product.retired', 'facility.updated'])
        ->and($events[0]->changes)->toBe(['max_stock_level' => [100, 120]])
        ->and($events[0]->state_id)->toBeNull()
        ->and($events[2]->summary)->toBe('Facility Rimi PHC details changed')
        ->and($events[2]->changes)->toBe(['phone' => [null, '0803']]);

    $this->actingAs($this->u['lga'], 'sanctum')->getJson('/api/v1/audit-events')
        ->assertJsonPath('meta.pagination.total', 1)->assertJsonPath('data.0.category', 'facilities');
    $this->actingAs($this->u['federal'], 'sanctum')->getJson('/api/v1/audit-events?category=catalog')
        ->assertJsonPath('meta.pagination.total', 2);
});

it('filters by text and date', function () {
    ($this->receive)($this->f['kawo'], 10);
    CarbonImmutable::setTestNow('2026-09-28 10:00:00');
    ($this->receive)($this->f['kawo'], 20);

    $this->actingAs($this->u['federal'], 'sanctum');
    $this->getJson('/api/v1/audit-events?q=balance 30')->assertJsonPath('meta.pagination.total', 1);
    $this->getJson('/api/v1/audit-events?from=2026-09-27')->assertJsonPath('meta.pagination.total', 1)
        ->assertJsonPath('data.0.summary', 'Receipt 20 × ORS-LO from CMS — balance 30');
    $this->getJson('/api/v1/audit-events?to=2026-09-26')->assertJsonPath('meta.pagination.total', 1);
});

it('backfills earlier history once', function () {
    ($this->receive)($this->f['kawo'], 10);
    ($this->receive)($this->f['kawo'], 5);
    AuditEvent::query()->delete();

    $this->artisan('audit:backfill')->expectsOutputToContain('Logged 2 Stock Card entries')->assertSuccessful();
    expect(AuditEvent::where('action', 'stock.recorded')->count())->toBe(2)
        ->and(AuditEvent::first()->actor_id)->toBe($this->u['admin']->id);

    $this->artisan('audit:backfill')->expectsOutputToContain('Logged 0 Stock Card entries')->assertSuccessful();
    expect(AuditEvent::count())->toBe(2);
});
