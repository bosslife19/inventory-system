<?php

use App\Enums\Plan;
use App\Enums\UserRole;
use App\Models\Organization;
use App\Models\Payment;
use App\Models\PlanTier;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-26 10:00:00');
    config(['services.paystack.secret_key' => 'sk_test_secret', 'services.paystack.callback_url' => 'https://app.test/billing']);
    $this->h = hierarchyFixture(); // 4 open facilities, 5 active accounts
    $this->org = Organization::query()->orderBy('id')->firstOrFail();
    $this->org->update(['plan' => Plan::Free, 'paid_until' => null]);
    $this->admin = $this->h['users']['admin'];
    $this->starter = PlanTier::where('name', 'Starter')->firstOrFail(); // ₦25,000: 5 facilities, 15 accounts
    $this->standard = PlanTier::where('name', 'Standard')->firstOrFail(); // ₦75,000: 25 facilities, 75 accounts

    // One fake for the whole test; ($this->paystack)([...]) changes what verify answers next.
    $this->verify = [];
    Http::fake([
            'api.paystack.co/transaction/initialize' => fn (HttpRequest $r) => Http::response(['status' => true, 'message' => 'ok', 'data' => [
                'authorization_url' => 'https://checkout.paystack.com/abc', 'access_code' => 'abc', 'reference' => $r['reference'],
            ]]),
            'api.paystack.co/transaction/verify/*' => fn (HttpRequest $r) => Http::response(['status' => true, 'message' => 'ok', 'data' => [
                'id' => 99, 'status' => 'success', 'reference' => basename($r->url()), 'amount' => Payment::latest('id')->value('amount_kobo'),
                'currency' => 'NGN', 'channel' => 'card', 'paid_at' => '2026-10-26T09:05:00Z', 'gateway_response' => 'Successful', ...$this->verify,
            ]]),
    ]);
    $this->paystack = function (array $verify = []) {
        $this->verify = $verify;
    };
    // Each request as a request would see it: the admin and their organization freshly loaded.
    $this->asAdmin = fn () => $this->actingAs($this->admin->fresh());
    $this->checkout = function (PlanTier $tier, int $months = 1) {
        ($this->paystack)();

        return ($this->asAdmin)()->postJson('/api/v1/billing/checkout', ['plan_tier_id' => $tier->id, 'months' => $months]);
    };
    $this->webhook = function (array $body, ?string $secret = 'sk_test_secret') {
        $json = json_encode($body);

        return $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_PAYSTACK_SIGNATURE' => hash_hmac('sha512', $json, $secret),
        ], $json);
    };
});

it('shows admins the tiers on offer, and no one else', function () {
    $this->standard->update(['is_active' => false]);

    $this->actingAs($this->admin)->getJson('/api/v1/billing/plans')->assertOk()
        ->assertJsonPath('data.0.name', 'Starter')->assertJsonPath('data.0.monthly_price', 25000)
        ->assertJsonPath('data.0.max_facilities', 5)->assertJsonPath('data.1.name', 'Enterprise')
        ->assertJsonPath('data.1.max_accounts', null)->assertJsonCount(2, 'data');

    $this->actingAs($this->h['users']['federal'])->getJson('/api/v1/billing/plans')->assertForbidden();
    $this->actingAs($this->h['users']['federal'])->getJson('/api/v1/billing/payments')->assertForbidden();
});

it('starts a Paystack checkout for a tier and a number of months', function () {
    $res = ($this->checkout)($this->standard, 3)->assertCreated()
        ->assertJsonPath('authorization_url', 'https://checkout.paystack.com/abc')
        ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.amount', 225000)
        ->assertJsonPath('data.plan_tier.name', 'Standard')->assertJsonPath('data.months', 3);

    $reference = $res->json('data.reference');
    expect($reference)->toStartWith("SUB-{$this->org->id}-");
    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/transaction/initialize')
        && $r['amount'] === 22_500_000 && $r['email'] === $this->admin->email && $r['reference'] === $reference
        && $r['callback_url'] === 'https://app.test/billing' && $r->hasHeader('Authorization', 'Bearer sk_test_secret'));

    // Nothing changes until it's paid.
    expect($this->org->fresh()->plan)->toBe(Plan::Free);
});

it('refuses checkouts it can’t take', function () {
    ($this->paystack)();
    $post = fn (User $u, array $body) => $this->actingAs($u->fresh())->postJson('/api/v1/billing/checkout', $body);

    $post($this->h['users']['state'], ['plan_tier_id' => $this->starter->id, 'months' => 1])->assertForbidden();
    $post($this->admin, ['plan_tier_id' => $this->starter->id, 'months' => 2])->assertUnprocessable()->assertJsonValidationErrors('months');
    $this->starter->update(['is_active' => false]);
    $post($this->admin, ['plan_tier_id' => $this->starter->id, 'months' => 1])->assertUnprocessable()->assertJsonValidationErrors('plan_tier_id');

    // A paid plan with no end date has nothing to pay for.
    $this->org->update(['plan' => Plan::Paid, 'paid_until' => null]);
    $post($this->admin, ['plan_tier_id' => $this->standard->id, 'months' => 1])->assertUnprocessable()->assertJsonValidationErrors('plan_tier_id');

    // Without a secret key there's no online payment.
    $this->org->update(['plan' => Plan::Free]);
    config(['services.paystack.secret_key' => null]);
    $post($this->admin, ['plan_tier_id' => $this->standard->id, 'months' => 1])->assertStatus(503)->assertJsonPath('code', 'payment_gateway_error');
    expect(Payment::latest('id')->first()->status)->toBe('failed');
});

it('applies a payment once Paystack confirms it, and only once', function () {
    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');

    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")->assertOk()
        ->assertJsonPath('data.status', 'success')->assertJsonPath('data.channel', 'card')
        ->assertJsonPath('data.period_start', '2026-10-26')->assertJsonPath('data.period_end', '2026-11-25');

    $org = $this->org->fresh();
    expect($org->effectivePlan())->toBe(Plan::Paid)
        ->and($org->plan_tier_id)->toBe($this->starter->id)
        ->and($org->paid_until->toDateString())->toBe('2026-11-25');
    ($this->asAdmin)()->getJson('/api/v1/auth/me')->assertJsonPath('data.organization.plan', 'paid')
        ->assertJsonPath('data.organization.tier.name', 'Starter')
        ->assertJsonPath('data.organization.limits', [
            'roles_in_use' => [], 'facility_in_use' => false,
            'max_accounts' => 15, 'accounts_in_use' => 5, 'max_facilities' => 5, 'facilities_in_use' => 4,
        ]);

    // Verifying again (or the webhook arriving after) doesn't ask Paystack or extend anything.
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")->assertOk();
    Http::assertSentCount(2); // initialize + one verify
    ($this->webhook)(['event' => 'charge.success', 'data' => ['reference' => $reference, 'status' => 'success', 'amount' => 2_500_000, 'currency' => 'NGN']])->assertOk();
    expect($this->org->fresh()->paid_until->toDateString())->toBe('2026-11-25');

    ($this->asAdmin)()->getJson('/api/v1/billing/payments')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.reference', $reference);
});

it('doesn’t apply a payment for the wrong amount, or one that failed', function () {
    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    ($this->paystack)(['amount' => 100]);
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")->assertOk()->assertJsonPath('data.status', 'failed');
    expect($this->org->fresh()->plan)->toBe(Plan::Free);

    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    ($this->paystack)(['status' => 'abandoned', 'gateway_response' => 'The transaction was not completed']);
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")->assertOk()
        ->assertJsonPath('data.status', 'abandoned')->assertJsonPath('data.failure_reason', 'The transaction was not completed');

    // Still with the payer: stays pending.
    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    ($this->paystack)(['status' => 'ongoing']);
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")->assertOk()->assertJsonPath('data.status', 'pending');
    expect($this->org->fresh()->plan)->toBe(Plan::Free);

    // Another organization's reference is a 404.
    $this->actingAs(User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null]));
    $other = Organization::create(['name' => 'Other', 'plan' => Plan::Free]);
    Payment::query()->whereKey(Payment::latest('id')->value('id'))->update(['organization_id' => $other->id]);
    $this->actingAs($this->admin)->postJson("/api/v1/billing/payments/{$reference}/verify")->assertNotFound();
});

it('settles payments from Paystack’s signed webhook', function () {
    $reference = ($this->checkout)($this->standard, 12)->json('data.reference');
    $event = ['event' => 'charge.success', 'data' => ['id' => 7, 'reference' => $reference, 'status' => 'success', 'amount' => 90_000_000, 'currency' => 'NGN', 'channel' => 'bank_transfer']];

    ($this->webhook)($event, 'not-the-secret')->assertUnauthorized();
    expect(Payment::where('reference', $reference)->value('status'))->toBe('pending');

    ($this->webhook)($event)->assertOk();
    $payment = Payment::where('reference', $reference)->first();
    expect($payment->status)->toBe('success')->and($payment->channel)->toBe('bank_transfer')
        ->and($this->org->fresh()->paid_until->toDateString())->toBe('2027-10-25');

    // Unknown references and other events are acknowledged and ignored.
    ($this->webhook)(['event' => 'charge.success', 'data' => ['reference' => 'NOT-OURS', 'status' => 'success']])->assertOk();
    ($this->webhook)(['event' => 'transfer.success', 'data' => []])->assertOk();
});

it('extends the same tier from its last day, and converts days left when changing tier', function () {
    $this->org->update(['plan' => Plan::Paid, 'plan_tier_id' => $this->starter->id, 'paid_until' => '2026-11-04']); // 10 days left

    // Same tier: on from its last day.
    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")
        ->assertJsonPath('data.period_start', '2026-11-05')->assertJsonPath('data.period_end', '2026-12-04')->assertJsonPath('data.credit_days', 0);

    // Bigger tier: starts today; 40 days of Starter (₦25k) are worth 13 days of Standard (₦75k).
    $reference = ($this->checkout)($this->standard, 1)->json('data.reference');
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")
        ->assertJsonPath('data.period_start', '2026-10-26')->assertJsonPath('data.credit_days', 13)
        ->assertJsonPath('data.period_end', '2026-12-08');
    expect($this->org->fresh()->plan_tier_id)->toBe($this->standard->id);

    // A paid plan the owner set without a tier keeps its days; the tier follows them.
    $this->org->update(['plan_tier_id' => null, 'paid_until' => '2026-10-31']);
    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")
        ->assertJsonPath('data.period_start', '2026-11-01')->assertJsonPath('data.period_end', '2026-11-30');

    // A lapsed plan starts again today.
    $this->org->update(['paid_until' => '2026-10-01']);
    $reference = ($this->checkout)($this->starter, 6)->json('data.reference');
    ($this->asAdmin)()->postJson("/api/v1/billing/payments/{$reference}/verify")
        ->assertJsonPath('data.period_start', '2026-10-26')->assertJsonPath('data.period_end', '2027-04-25');
});

it('holds a paid tier to its accounts and facilities, every role together', function () {
    $this->org->update(['plan' => Plan::Paid, 'plan_tier_id' => $this->starter->id, 'paid_until' => '2026-12-31']);
    $this->starter->update(['max_accounts' => 5, 'max_facilities' => 4]); // exactly what the fixture has
    $kadunaNorth = $this->h['lgas']['kadunaNorth'];

    // Any role: the cap is on accounts in total.
    ($this->asAdmin)()->postJson('/api/v1/users', ['name' => 'Two', 'email' => 'fed2@example.test', 'role' => 'federal_officer'])
        ->assertStatus(402)->assertJson(['code' => 'plan_limit_reached', 'limit' => 'accounts', 'max' => 5]);
    ($this->asAdmin)()->postJson('/api/v1/facilities', ['lga_id' => $kadunaNorth->id, 'name' => 'New PHC', 'type' => 'health_center'])
        ->assertStatus(402)->assertJson(['code' => 'plan_limit_reached', 'limit' => 'facilities', 'max' => 4]);

    // Changing an active account's role takes no new place.
    $state = $this->h['users']['state'];
    ($this->asAdmin)()->putJson("/api/v1/users/{$state->id}", ['role' => 'federal_officer', 'state_id' => null])->assertOk();

    // Deactivating frees a place; reactivating it is then refused once the place is taken.
    ($this->asAdmin)()->putJson("/api/v1/users/{$state->id}", ['is_active' => false])->assertOk();
    ($this->asAdmin)()->postJson('/api/v1/users', ['name' => 'Two', 'email' => 'fed2@example.test', 'role' => 'federal_officer'])->assertCreated();
    ($this->asAdmin)()->putJson("/api/v1/users/{$state->id}", ['is_active' => true])->assertStatus(402);

    // No limit on a tier means none.
    $this->starter->update(['max_accounts' => null, 'max_facilities' => null]);
    ($this->asAdmin)()->postJson('/api/v1/facilities', ['lga_id' => $kadunaNorth->id, 'name' => 'New PHC', 'type' => 'health_center'])->assertCreated();
    ($this->asAdmin)()->getJson('/api/v1/auth/me')->assertJsonPath('data.organization.limits', null);
});

it('lets the owner set tiers and see each organization’s payments', function () {
    $owner = User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null]);

    $this->actingAs($this->admin)->getJson('/api/v1/owner/plan-tiers')->assertForbidden();

    $this->actingAs($owner)->getJson('/api/v1/owner/plan-tiers')->assertOk()->assertJsonCount(3, 'data');
    $id = $this->postJson('/api/v1/owner/plan-tiers', ['name' => 'NGO', 'monthly_price' => 10000, 'max_facilities' => 2, 'max_accounts' => 6])
        ->assertCreated()->json('data.id');
    $this->putJson("/api/v1/owner/plan-tiers/{$id}", ['monthly_price' => 12000, 'is_active' => false])->assertOk()
        ->assertJsonPath('data.monthly_price', 12000)->assertJsonPath('data.is_active', false);
    $this->postJson('/api/v1/owner/plan-tiers', ['name' => 'Free money', 'monthly_price' => 0])->assertUnprocessable();

    // The owner can put an organization on a tier by hand, too.
    $this->putJson("/api/v1/owner/organizations/{$this->org->id}", ['plan' => 'paid', 'plan_tier_id' => $id, 'paid_until' => '2026-12-31'])
        ->assertOk()->assertJsonPath('data.plan_tier.name', 'NGO')->assertJsonPath('data.plan_tier.max_facilities', 2);

    $reference = ($this->checkout)($this->starter, 1)->json('data.reference');
    $this->actingAs($owner)->getJson("/api/v1/owner/organizations/{$this->org->id}/payments")->assertOk()
        ->assertJsonPath('data.0.reference', $reference)->assertJsonPath('data.0.paid_by', $this->admin->name);
});
