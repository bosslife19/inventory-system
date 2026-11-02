<?php

namespace App\Mail;

use App\Models\SupportMessage;
use App\Models\User;
use App\Support\MailOut;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** To an account: support replied in their chat (the first reply they haven't read yet). */
class SupportReplied extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly SupportMessage $message,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "{$this->platform} support replied");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.support-replied', with: [
            'name' => $this->user->name,
            'body' => $this->message->body,
            'platform' => $this->platform,
            'url' => MailOut::frontend(),
        ]);
    }
}
