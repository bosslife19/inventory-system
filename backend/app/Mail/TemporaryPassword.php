<?php

namespace App\Mail;

use App\Models\User;
use App\Support\MailOut;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent when an admin, officer or the platform owner resets someone's
 * password: the new temporary password. The account was signed out
 * everywhere and must choose its own password at the next sign-in.
 */
class TemporaryPassword extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly string $temporaryPassword,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Your {$this->platform} password was reset");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.temporary-password', with: [
            'name' => $this->user->name,
            'email' => $this->user->email,
            'password' => $this->temporaryPassword,
            'platform' => $this->platform,
            'signInUrl' => MailOut::frontend('login'),
        ]);
    }
}
