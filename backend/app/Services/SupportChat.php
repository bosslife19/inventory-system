<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Enums\UserRole;
use App\Mail\SupportMessageReceived;
use App\Mail\SupportReplied;
use App\Models\SupportConversation;
use App\Models\SupportMessage;
use App\Models\User;
use App\Support\MailOut;
use Illuminate\Support\Facades\DB;

/**
 * Support chat between an organization's accounts and the platform owner.
 * Each account has one conversation; writing in a closed one reopens it.
 * An owner reply is pushed to the account's phone (best effort, any plan —
 * it's the platform answering, not a paid feature).
 *
 * Email: the owner is told when a conversation gets its first message they
 * haven't read, and the account when it gets its first reply it hasn't read
 * — one email per unread stretch, not one per message.
 */
class SupportChat
{
    public function __construct(private readonly PushSender $push) {}

    /** The account's conversation, or null before its first message. */
    public function conversationOf(User $user): ?SupportConversation
    {
        return SupportConversation::where('user_id', $user->id)->first();
    }

    /** A message from the account itself: starts or reopens its conversation. */
    public function ask(User $user, string $body): SupportMessage
    {
        return DB::transaction(function () use ($user, $body) {
            $conversation = SupportConversation::firstOrCreate(
                ['user_id' => $user->id],
                ['organization_id' => $user->organization_id, 'status' => SupportConversation::OPEN],
            );
            $ownerHadUnread = $this->hasUnread($conversation, fromSupport: false, readUpTo: (int) $conversation->support_read_message_id);
            $message = $this->append($conversation, $user, false, $body);
            if (! $ownerHadUnread) {
                $this->emailOwners($conversation, $message);
            }
            // Your own message is read by definition.
            $conversation->update(['status' => SupportConversation::OPEN, 'closed_at' => null, 'user_read_message_id' => $message->id]);

            return $message;
        });
    }

    /** The platform owner's reply; pushed to the account's phone. */
    public function reply(SupportConversation $conversation, User $owner, string $body): SupportMessage
    {
        $message = DB::transaction(function () use ($conversation, $owner, $body) {
            $userHadUnread = $this->hasUnread($conversation, fromSupport: true, readUpTo: (int) $conversation->user_read_message_id);
            $message = $this->append($conversation, $owner, true, $body);
            $user = $conversation->user;
            if (! $userHadUnread && $user?->is_active) {
                MailOut::send($user->email, $user->name, fn (string $platform) => new SupportReplied($user, $message, $platform));
            }
            $conversation->update(['support_read_message_id' => $message->id]);

            return $message;
        });

        $this->pushReply($conversation, $message);

        return $message;
    }

    /** Mark everything so far read by the account ($support false) or the owner ($support true). */
    public function markRead(SupportConversation $conversation, bool $support): void
    {
        $latest = (int) $conversation->messages()->max('id');
        $conversation->update([$support ? 'support_read_message_id' : 'user_read_message_id' => $latest]);
    }

    private function hasUnread(SupportConversation $conversation, bool $fromSupport, int $readUpTo): bool
    {
        return $conversation->messages()->where('from_support', $fromSupport)->where('id', '>', $readUpTo)->exists();
    }

    /** Every active platform owner (they belong to no organization, so outside the tenant filter). */
    private function emailOwners(SupportConversation $conversation, SupportMessage $message): void
    {
        $conversation->loadMissing(['user', 'organization']);
        User::withoutGlobalScope(User::ORGANIZATION_SCOPE)
            ->where('role', UserRole::Owner)->where('is_active', true)->get(['id', 'name', 'email'])
            ->each(fn (User $owner) => MailOut::send($owner->email, $owner->name, fn (string $platform) => new SupportMessageReceived($conversation, $message, $platform)));
    }

    private function append(SupportConversation $conversation, User $sender, bool $fromSupport, string $body): SupportMessage
    {
        $message = $conversation->messages()->create([
            'sender_id' => $sender->id,
            'from_support' => $fromSupport,
            'body' => $body,
        ]);
        $conversation->forceFill([
            'last_message_at' => $message->created_at,
            'last_message_preview' => mb_strimwidth($body, 0, 200, '…'),
            'last_message_from_support' => $fromSupport,
        ])->save();

        return $message;
    }

    private function pushReply(SupportConversation $conversation, SupportMessage $message): void
    {
        $user = $conversation->user;
        if (! $user?->fcm_token || ! $user->is_active) {
            return;
        }
        try {
            $dead = $this->push->send([$user->fcm_token], 'Support replied', mb_strimwidth($message->body, 0, 180, '…'), [
                'type' => 'support',
                'url' => 'stockcard://support',
            ]);
            if ($dead !== []) {
                $user->update(['fcm_token' => null]);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
