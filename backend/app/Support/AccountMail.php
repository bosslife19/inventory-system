<?php

namespace App\Support;

use App\Mail\AccountCreated;
use App\Mail\PasswordResetLink;
use App\Mail\TemporaryPassword;
use App\Mail\VerifyEmail;
use App\Models\User;
use Illuminate\Support\Facades\URL;

/**
 * The emails that come with an account: sign-in details for an account
 * someone else made, a new temporary password after someone reset it, email
 * confirmation after signing up, and a link to choose a new password when
 * you've forgotten yours. Sent through MailOut (after commit, best effort):
 * a temporary password is still shown on screen if the mail fails.
 */
final class AccountMail
{
    public static function accountCreated(User $user, string $temporaryPassword): void
    {
        MailOut::send($user->email, $user->name, fn (string $platform) => new AccountCreated($user, $temporaryPassword, $platform));
    }

    /** An admin, officer or the owner reset this account's password to a temporary one. */
    public static function passwordReset(User $user, string $temporaryPassword): void
    {
        MailOut::send($user->email, $user->name, fn (string $platform) => new TemporaryPassword($user, $temporaryPassword, $platform));
    }

    public static function verifyEmail(User $user): void
    {
        MailOut::send($user->email, $user->name, fn (string $platform) => new VerifyEmail($user, self::verificationUrl($user), $platform));
    }

    /** "Forgot password": a link to the web app's reset page carrying a one-time token. */
    public static function passwordResetLink(User $user, string $token): void
    {
        $url = MailOut::frontend('reset-password').'?'.http_build_query(['token' => $token, 'email' => $user->email]);
        MailOut::send($user->email, $user->name, fn (string $platform) => new PasswordResetLink($user, $url, $platform));
    }

    /** A signed link to the API, which confirms the address and sends the browser on to the web app. */
    public static function verificationUrl(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHours((int) config('app.email_verification_hours')), [
            'user' => $user->id,
            'hash' => sha1($user->email),
        ]);
    }
}
