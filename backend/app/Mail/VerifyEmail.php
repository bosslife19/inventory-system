<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** After signing up: a link to confirm the email address, which opens everything else. */
class VerifyEmail extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly string $url,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Confirm your email for {$this->platform}");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.verify-email', with: [
            'name' => $this->user->name,
            'organization' => $this->user->organization?->name,
            'platform' => $this->platform,
            'url' => $this->url,
            'hours' => (int) config('app.email_verification_hours'),
        ]);
    }
}
