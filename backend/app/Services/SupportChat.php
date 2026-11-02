<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Models\SupportConversation;
use App\Models\SupportMessage;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Support chat between an organization's accounts and the platform owner.
 * Each account has one conversation; writing in a closed one reopens it.
 * An owner reply is pushed to the account's phone (best effort, any plan —
 * it's the platform answering, not a paid feature).
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
            $message = $this->append($conversation, $user, false, $body);
            // Your own message is read by definition.
            $conversation->update(['status' => SupportConversation::OPEN, 'closed_at' => null, 'user_read_message_id' => $message->id]);

            return $message;
        });
    }

    /** The platform owner's reply; pushed to the account's phone. */
    public function reply(SupportConversation $conversation, User $owner, string $body): SupportMessage
    {
        $message = DB::transaction(function () use ($conversation, $owner, $body) {
            $message = $this->append($conversation, $owner, true, $body);
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
