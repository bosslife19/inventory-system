<?php

use App\Contracts\PushSender;
use App\Enums\Plan;
use App\Enums\UserRole;
use App\Models\Organization;
use App\Models\SupportConversation;
use App\Models\User;
use App\Support\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-11-02 10:00:00');
    $this->h = hierarchyFixture();
    $this->sdp = $this->h['users']['sdp'];
    $this->owner = User::factory()->create(['role' => UserRole::Owner, 'organization_id' => null]);

    $this->pushes = new class implements PushSender
    {
        /** @var list<array{tokens: list<string>, title: string, body: string, data: array<string, string>}> */
        public array $sent = [];

        public function send(array $tokens, string $title, string $body, array $data = []): array
        {
            $this->sent[] = compact('tokens', 'title', 'body', 'data');

            return [];
        }
    };
    app()->instance(PushSender::class, $this->pushes);
});

it('starts an account\'s conversation with its first message and lets it poll for replies', function () {
    $this->actingAs($this->sdp)->getJson('/api/v1/support/messages')
        ->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.status', null)->assertJsonPath('meta.unread_count', 0);

    $first = $this->postJson('/api/v1/support/messages', ['body' => '  How do I record a physical count?  '])
        ->assertCreated()
        ->assertJsonPath('data.body', 'How do I record a physical count?')
        ->assertJsonPath('data.from_support', false)
        ->json('data.id');

    $conversation = SupportConversation::sole();
    expect($conversation->user_id)->toBe($this->sdp->id)
        ->and($conversation->organization_id)->toBe($this->sdp->organization_id)
        ->and($conversation->status)->toBe('open');

    // The owner answers; the account sees one unread reply when it next polls.
    $this->actingAs($this->owner)->postJson("/api/v1/owner/support/conversations/{$conversation->id}/messages", ['body' => 'Pick "Inventory" on the record sheet.'])
        ->assertCreated()->assertJsonPath('data.from_support', true);

    $this->actingAs($this->sdp)->getJson("/api/v1/support/messages?after={$first}")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.body', 'Pick "Inventory" on the record sheet.')
        ->assertJsonPath('data.0.sender_name', $this->owner->name)
        ->assertJsonPath('meta.unread_count', 1);
    $this->getJson('/api/v1/support/unread')->assertJsonPath('data.unread_count', 1);

    $this->postJson('/api/v1/support/read')->assertNoContent();
    $this->getJson('/api/v1/support/unread')->assertJsonPath('data.unread_count', 0);

    // Still one conversation per account.
    $this->postJson('/api/v1/support/messages', ['body' => 'Thanks!'])->assertCreated();
    expect(SupportConversation::count())->toBe(1);
});

it('pushes the owner\'s reply to the account\'s phone, on any plan', function () {
    Organization::query()->update(['plan' => Plan::Free]);
    $this->sdp->update(['fcm_token' => 'kawo-phone']);
    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'Hello'])->assertCreated();

    $this->actingAs($this->owner)->postJson('/api/v1/owner/support/conversations/'.SupportConversation::sole()->id.'/messages', ['body' => 'Hi, how can I help?'])
        ->assertCreated();

    expect($this->pushes->sent)->toHaveCount(1)
        ->and($this->pushes->sent[0]['tokens'])->toBe(['kawo-phone'])
        ->and($this->pushes->sent[0]['title'])->toBe('Support replied')
        ->and($this->pushes->sent[0]['data'])->toMatchArray(['type' => 'support', 'url' => 'stockcard://support']);
});

it('shows the owner every organization\'s conversations with unread counts, and closes and reopens them', function () {
    $other = Organization::create(['name' => 'Other Partner', 'plan' => Plan::Paid]);
    $otherAdmin = Tenant::run($other, fn () => User::factory()->admin()->create(['name' => 'Ngozi Admin']));

    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'First'])->assertCreated();
    $this->actingAs($otherAdmin)->postJson('/api/v1/support/messages', ['body' => 'Need help with billing'])->assertCreated();
    $this->postJson('/api/v1/support/messages', ['body' => 'Hello?'])->assertCreated();

    $this->actingAs($this->owner);
    $list = $this->getJson('/api/v1/owner/support/conversations')->assertOk()->assertJsonCount(2, 'data');
    expect($list->json('data.0.user.name'))->toBe('Ngozi Admin')
        ->and($list->json('data.0.organization.name'))->toBe('Other Partner')
        ->and($list->json('data.0.unread_count'))->toBe(2)
        ->and($list->json('data.0.last_message_preview'))->toBe('Hello?');
    $this->getJson('/api/v1/owner/support/unread')->assertJsonPath('data.unread_conversations', 2);
    $this->getJson('/api/v1/owner/support/conversations?q=other')->assertJsonCount(1, 'data');

    $id = $list->json('data.0.id');
    $this->getJson("/api/v1/owner/support/conversations/{$id}/messages")->assertJsonCount(2, 'data')->assertJsonPath('data.0.body', 'Need help with billing');
    $this->postJson("/api/v1/owner/support/conversations/{$id}/read")->assertNoContent();
    $this->getJson('/api/v1/owner/support/unread')->assertJsonPath('data.unread_conversations', 1);

    $this->putJson("/api/v1/owner/support/conversations/{$id}", ['status' => 'closed'])->assertOk()->assertJsonPath('data.status', 'closed');
    $this->getJson('/api/v1/owner/support/conversations?status=open')->assertJsonCount(1, 'data');

    // Writing again reopens it.
    $this->actingAs($otherAdmin)->postJson('/api/v1/support/messages', ['body' => 'One more thing'])->assertCreated();
    expect(SupportConversation::withoutGlobalScopes()->find($id)->status)->toBe('open');
});

it('keeps conversations private: accounts see only their own, and only the owner sees the inbox', function () {
    $this->actingAs($this->sdp)->postJson('/api/v1/support/messages', ['body' => 'Mine'])->assertCreated();
    $id = SupportConversation::sole()->id;

    $this->actingAs($this->h['users']['admin'])->getJson('/api/v1/support/messages')->assertOk()->assertJsonPath('data', []);
    $this->getJson('/api/v1/owner/support/conversations')->assertForbidden();
    $this->getJson("/api/v1/owner/support/conversations/{$id}/messages")->assertForbidden();
    $this->postJson("/api/v1/owner/support/conversations/{$id}/messages", ['body' => 'Sneaky'])->assertForbidden();

    // The owner isn't an organization member: no conversation of their own.
    $this->actingAs($this->owner)->getJson('/api/v1/support/messages')->assertForbidden();
});

it('rejects empty and overlong messages', function () {
    $this->actingAs($this->sdp);
    $this->postJson('/api/v1/support/messages', ['body' => '   '])->assertUnprocessable()->assertJsonValidationErrors('body');
    $this->postJson('/api/v1/support/messages', ['body' => str_repeat('a', 2001)])->assertUnprocessable()->assertJsonValidationErrors('body');
    expect(SupportConversation::count())->toBe(0);
});
