<?php

use App\Contracts\PushSender;
use App\Enums\UserRole;
use App\Mail\PasswordResetLink;
use App\Mail\SupportMessageReceived;
use App\Mail\SupportReplied;
use App\Mail\TemporaryPassword;
use App\Models\SupportConversation;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-11-02 10:00:00');
    config(['app.frontend_url' => 'https://app.test']);
    Mail::fake();
    app()->instance(PushSender::class, new class implements PushSender
    {
        public function send(array $tokens, string $title, string $body, array $data = []): array
        {
            return [];
        }
    });
    $this->h = hierarchyFixture();
    $this->sdp = $this->h['users']['sdp'];
    $this->owner = User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null, 'email' => 'owner@platform.test']);
});

// ------------------------------------------------------------------ forgot password

it('emails a reset link and lets the account choose a new password with it', function () {
    $this->sdp->createToken('phone');
    $this->postJson('/api/v1/auth/forgot-password', ['email' => '  '.strtoupper($this->sdp->email).' '])
        ->assertOk()->assertJsonPath('message', 'If an account uses that email, we’ve sent it a link to choose a new password.');

    $url = null;
    Mail::assertSent(PasswordResetLink::class, function (PasswordResetLink $mail) use (&$url) {
        $url = $mail->url;

        return $mail->hasTo($this->sdp->email);
    });
    expect($url)->toStartWith('https://app.test/reset-password?token=');
    parse_str(parse_url($url, PHP_URL_QUERY), $query);
    expect($query['email'])->toBe($this->sdp->email);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => $query['email'], 'token' => $query['token'], 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1',
    ])->assertOk();

    expect($this->sdp->fresh()->tokens()->count())->toBe(0); // signed out everywhere
    $this->postJson('/api/v1/auth/login', ['email' => $this->sdp->email, 'password' => 'new-secret-1'])->assertOk();

    // The link works once.
    $this->postJson('/api/v1/auth/reset-password', [
        'email' => $query['email'], 'token' => $query['token'], 'password' => 'another-1', 'password_confirmation' => 'another-1',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');
});

it('answers the same for unknown and deactivated accounts, and sends nothing', function () {
    $this->h['users']['lga']->update(['is_active' => false]);

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'nobody@example.test'])->assertOk();
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $this->h['users']['lga']->email])->assertOk();

    Mail::assertNothingSent();
});

it('sends one link a minute at most, and rejects a wrong or expired token', function () {
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $this->sdp->email])->assertOk();
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $this->sdp->email])->assertOk();
    Mail::assertSent(PasswordResetLink::class, 1);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => $this->sdp->email, 'token' => 'not-the-token', 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');

    $token = null;
    Mail::assertSent(PasswordResetLink::class, function (PasswordResetLink $mail) use (&$token) {
        parse_str(parse_url($mail->url, PHP_URL_QUERY), $q);
        $token = $q['token'];

        return true;
    });
    CarbonImmutable::setTestNow('2026-11-02 11:01:00'); // links last an hour
    $this->travelTo(CarbonImmutable::now());
    $this->postJson('/api/v1/auth/reset-password', [
        'email' => $this->sdp->email, 'token' => $token, 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');
});

it('lets someone on a temporary password reset it too, which also confirms their email', function () {
    $this->sdp->update(['must_change_password' => true, 'email_verified_at' => null]);
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $this->sdp->email]);
    Mail::assertSent(PasswordResetLink::class, function (PasswordResetLink $mail) {
        parse_str(parse_url($mail->url, PHP_URL_QUERY), $q);
        $this->postJson('/api/v1/auth/reset-password', [
            'email' => $q['email'], 'token' => $q['token'], 'password' => 'new-secret-1', 'password_confirmation' => 'new-secret-1',
        ])->assertOk();

        return true;
    });

    $user = $this->sdp->fresh();
    expect($user->must_change_password)->toBeFalse()->and($user->email_verified_at)->not->toBeNull();
});

// ------------------------------------------------------------------ reset by someone else

it('emails the new temporary password when an admin resets an account', function () {
    $password = $this->actingAs($this->h['users']['admin'])->postJson("/api/v1/users/{$this->sdp->id}/reset-password")
        ->assertOk()->json('temporary_password');

    Mail::assertSent(TemporaryPassword::class, fn (TemporaryPassword $mail) => $mail->hasTo($this->sdp->email)
        && $mail->temporaryPassword === $password
        && str_contains($mail->render(), $password));
});

// ------------------------------------------------------------------ support chat

it('emails the owner once per unread stretch of a conversation', function () {
    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'Help with counts'])->assertCreated();
    $this->postJson('/api/v1/support/messages', ['body' => 'Anyone there?'])->assertCreated();

    Mail::assertSent(SupportMessageReceived::class, 1);
    Mail::assertSent(SupportMessageReceived::class, fn (SupportMessageReceived $mail) => $mail->hasTo('owner@platform.test')
        && $mail->message->body === 'Help with counts'
        && str_contains($mail->render(), 'https://app.test/owner/support?c='));

    // Once the owner has read it, the next message emails again.
    $id = SupportConversation::withoutGlobalScopes()->sole()->id;
    $this->actingAs($this->owner)->postJson("/api/v1/owner/support/conversations/{$id}/read")->assertNoContent();
    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'One more question'])->assertCreated();
    Mail::assertSent(SupportMessageReceived::class, 2);
});

it('emails the account its first unread reply, not every reply', function () {
    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'Hello'])->assertCreated();
    $id = SupportConversation::withoutGlobalScopes()->sole()->id;

    $this->actingAs($this->owner)->postJson("/api/v1/owner/support/conversations/{$id}/messages", ['body' => 'Hi! Looking now.'])->assertCreated();
    $this->postJson("/api/v1/owner/support/conversations/{$id}/messages", ['body' => 'Found it.'])->assertCreated();

    Mail::assertSent(SupportReplied::class, 1);
    Mail::assertSent(SupportReplied::class, fn (SupportReplied $mail) => $mail->hasTo($this->sdp->email) && $mail->message->body === 'Hi! Looking now.');

    $this->actingAs($this->sdp)->postJson('/api/v1/support/read')->assertNoContent();
    $this->actingAs($this->owner)->postJson("/api/v1/owner/support/conversations/{$id}/messages", ['body' => 'Anything else?'])->assertCreated();
    Mail::assertSent(SupportReplied::class, 2);
});

it('renders every email', function () {
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $this->sdp->email]);
    Mail::assertSent(PasswordResetLink::class, fn (PasswordResetLink $mail) => str_contains($mail->render(), 'Choose a new password'));
});
