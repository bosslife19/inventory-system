<?php

namespace App\Mail;

use App\Models\SupportConversation;
use App\Models\SupportMessage;
use App\Support\MailOut;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** To the platform owner: someone wrote to support (the first unread message of a conversation). */
class SupportMessageReceived extends Mailable
{
    public function __construct(
        public readonly SupportConversation $conversation,
        public readonly SupportMessage $message,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Support: new message from {$this->conversation->user->name}");
    }

    public function content(): Content
    {
        $user = $this->conversation->user;

        return new Content(markdown: 'mail.support-message-received', with: [
            'name' => $user->name,
            'email' => $user->email,
            'organization' => $this->conversation->organization?->name,
            'body' => $this->message->body,
            'platform' => $this->platform,
            'url' => MailOut::frontend("owner/support?c={$this->conversation->id}"),
        ]);
    }
}
