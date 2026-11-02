<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** "Forgot password": a one-time link to choose a new password on the web app. */
class PasswordResetLink extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly string $url,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Reset your {$this->platform} password");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.password-reset-link', with: [
            'name' => $this->user->name,
            'platform' => $this->platform,
            'url' => $this->url,
            'minutes' => (int) config('auth.passwords.users.expire'),
        ]);
    }
}
