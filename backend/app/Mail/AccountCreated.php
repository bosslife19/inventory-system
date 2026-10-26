<?php

namespace App\Mail;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent to someone whose account another person made (an admin, an officer,
 * the platform owner setting up an organization, or a CSV import): their
 * temporary password and how to sign in. They choose their own password at
 * first sign-in, which also confirms this email address.
 */
class AccountCreated extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly string $temporaryPassword,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Your {$this->platform} account");
    }

    public function content(): Content
    {
        $user = $this->user;

        return new Content(markdown: 'mail.account-created', with: [
            'name' => $user->name,
            'email' => $user->email,
            'password' => $this->temporaryPassword,
            'platform' => $this->platform,
            'organization' => $user->organization?->name,
            'role' => match ($user->role) {
                UserRole::SdpStaff => 'facility staff',
                UserRole::Owner => 'platform owner',
                default => str_replace('_', ' ', $user->role->value),
            },
            'isAdmin' => $user->role === UserRole::Admin,
            'signInUrl' => config('app.frontend_url').'/login',
        ]);
    }
}
