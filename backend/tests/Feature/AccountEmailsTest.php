<?php

use App\Enums\UserRole;
use App\Mail\AccountCreated;
use App\Mail\VerifyEmail;
use App\Models\Organization;
use App\Models\User;
use App\Support\AccountMail;
use App\Support\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-26 10:00:00');
    config(['app.frontend_url' => 'https://app.test']);
    Mail::fake();
    $this->h = hierarchyFixture();
    $this->owner = User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null]);

    $this->signUp = fn (string $email = 'amina@trust.test') => $this->postJson('/api/v1/auth/register', [
        'organization_name' => 'Kano Health Trust', 'name' => 'Amina Bello', 'email' => $email,
        'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ]);
});

// ------------------------------------------------------- sign-in details

it('emails a new account its temporary password and how to sign in', function () {
    $res = $this->actingAs($this->h['users']['admin'])->postJson('/api/v1/users', [
        'name' => 'New Officer', 'email' => 'new@example.test', 'role' => 'lga_officer', 'lga_id' => $this->h['lgas']['zaria']->id,
    ])->assertCreated();
    $password = $res->json('temporary_password');

    Mail::assertSent(AccountCreated::class, function (AccountCreated $mail) use ($password) {
        $html = $mail->render();

        return $mail->hasTo('new@example.test')
            && $mail->temporaryPassword === $password
            && str_contains($html, $password)
            && str_contains($html, 'https://app.test/login')
            && str_contains($html, 'lga officer')
            && str_contains($html, 'choose your own password');
    });
    Mail::assertSentCount(1);
});

it('emails the first admin when the owner sets up an organization, and admins the owner adds later', function () {
    $this->actingAs($this->owner);
    Tenant::set(null);
    $this->postJson('/api/v1/owner/organizations', [
        'name' => 'Lagos Partners', 'plan' => 'free', 'admin' => ['name' => 'Ada Obi', 'email' => 'ada@lagos.test'],
    ])->assertCreated();
    Mail::assertSent(AccountCreated::class, fn (AccountCreated $m) => $m->hasTo('ada@lagos.test')
        && str_contains($m->render(), 'Lagos Partners') && str_contains($m->render(), 'As an admin'));

    // No admin given: no account, so no email.
    $this->postJson('/api/v1/owner/organizations', ['name' => 'Empty Org', 'plan' => 'free'])->assertCreated();
    Mail::assertSentCount(1);

    $org = Organization::where('name', 'Lagos Partners')->firstOrFail();
    $this->postJson("/api/v1/owner/organizations/{$org->id}/admins", ['name' => 'Second', 'email' => 'second@lagos.test'])->assertCreated();
    Mail::assertSent(AccountCreated::class, fn (AccountCreated $m) => $m->hasTo('second@lagos.test'));
});

it('emails imported accounts only once the import is committed', function () {
    $upload = fn (bool $dryRun) => $this->actingAs($this->h['users']['lga'], 'sanctum')->post('/api/v1/imports/users', [
        'file' => UploadedFile::fake()->createWithContent('import.csv', implode("\n", [
            'name,email,role,state,lga,facility',
            'Musa Ali,musa@rimi.test,sdp_staff,Kaduna,Kaduna North,Rimi PHC',
        ])),
        'dry_run' => $dryRun ? 'true' : 'false',
    ], ['Accept' => 'application/json']);

    $upload(true)->assertOk()->assertJsonPath('data.committed', false);
    Mail::assertNothingSent();

    $upload(false)->assertOk()->assertJsonPath('data.committed', true);
    Mail::assertSent(AccountCreated::class, fn (AccountCreated $m) => $m->hasTo('musa@rimi.test'));
});

it('still creates the account when the email can’t be sent', function () {
    Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP down'));

    $this->actingAs($this->h['users']['admin'])->postJson('/api/v1/users', [
        'name' => 'New Officer', 'email' => 'new@example.test', 'role' => 'federal_officer',
    ])->assertCreated()->assertJsonStructure(['temporary_password']);
    expect(User::where('email', 'new@example.test')->exists())->toBeTrue();
});

// ------------------------------------------------------- email confirmation

it('asks people who sign up to confirm their email before anything else', function () {
    Tenant::set(null);
    $token = ($this->signUp)()->assertCreated()->assertJsonPath('data.user.email_verified', false)->json('data.token');

    $url = null;
    Mail::assertSent(VerifyEmail::class, function (VerifyEmail $m) use (&$url) {
        $url = $m->url;

        return $m->hasTo('amina@trust.test') && str_contains($m->render(), 'Confirm my email');
    });
    Mail::assertNotSent(AccountCreated::class);

    // Held until confirmed: only me, sign out and resending are open.
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email_verified', false);
    $this->withToken($token)->getJson('/api/v1/products')->assertForbidden()->assertJsonPath('code', 'email_verification_required');
    $this->withToken($token)->postJson('/api/v1/auth/email/resend')->assertStatus(202);
    Mail::assertSentCount(2);

    // The link confirms it and lands on the web app.
    $this->get($url)->assertRedirect('https://app.test/email-verified?status=verified');
    $this->get($url)->assertRedirect('https://app.test/email-verified?status=already');
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertJsonPath('data.email_verified', true);
    $this->withToken($token)->getJson('/api/v1/products')->assertOk();
    $this->withToken($token)->postJson('/api/v1/auth/email/resend')->assertOk();
});

it('refuses tampered or expired confirmation links', function () {
    Tenant::set(null);
    ($this->signUp)()->assertCreated();
    $user = User::withoutGlobalScopes()->where('email', 'amina@trust.test')->firstOrFail();
    $url = AccountMail::verificationUrl($user);

    $this->get(str_replace(sha1($user->email), sha1('someone@else.test'), $url))->assertRedirect('https://app.test/email-verified?status=invalid');
    $this->get(str_replace('/verify/'.$user->id.'/', '/verify/999999/', $url))->assertRedirect('https://app.test/email-verified?status=invalid');
    $this->get($url.'x')->assertRedirect('https://app.test/email-verified?status=expired');

    CarbonImmutable::setTestNow('2026-10-28 11:00:00'); // past the 48 hours
    $this->get($url)->assertRedirect('https://app.test/email-verified?status=expired');
    expect($user->fresh()->email_verified_at)->toBeNull();
});

it('takes an account someone else made as confirmed once its temporary password is replaced', function () {
    $this->actingAs($this->h['users']['admin'])->postJson('/api/v1/users', [
        'name' => 'New Officer', 'email' => 'new@example.test', 'role' => 'federal_officer', 'temporary_password' => 'temp-pass-1',
    ])->assertCreated();
    $user = User::where('email', 'new@example.test')->firstOrFail();
    expect($user->email_verified_at)->toBeNull()->and($user->needsEmailVerification())->toBeFalse();

    $this->actingAs($user)->postJson('/api/v1/auth/password', [
        'current_password' => 'temp-pass-1', 'password' => 'my-own-pass', 'password_confirmation' => 'my-own-pass',
    ])->assertOk()->assertJsonPath('data.email_verified', true);
    expect($user->fresh()->email_verified_at)->not->toBeNull();
});
