<?php

namespace App\Support;

use App\Mail\AccountCreated;
use App\Mail\VerifyEmail;
use App\Models\User;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Throwable;

/**
 * The emails that come with an account: sign-in details for an account
 * someone else made, and email confirmation after signing up. Sent inline
 * (no queue — see docs/ARCHITECTURE.md), once the surrounding transaction
 * commits, so a rolled-back create (a failed or dry-run CSV import) never
 * emails a password that doesn't exist. A mail failure is logged and never
 * undoes the account: the temporary password is still shown on screen.
 */
final class AccountMail
{
    public static function accountCreated(User $user, string $temporaryPassword): void
    {
        DB::afterCommit(fn () => self::send($user, fn (string $platform) => new AccountCreated($user, $temporaryPassword, $platform)));
    }

    public static function verifyEmail(User $user): void
    {
        DB::afterCommit(fn () => self::send($user, fn (string $platform) => new VerifyEmail($user, self::verificationUrl($user), $platform)));
    }

    /** A signed link to the API, which confirms the address and sends the browser on to the web app. */
    public static function verificationUrl(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHours((int) config('app.email_verification_hours')), [
            'user' => $user->id,
            'hash' => sha1($user->email),
        ]);
    }

    /** @param  callable(string): Mailable  $make */
    private static function send(User $user, callable $make): void
    {
        try {
            $platform = Platform::branding()['name'];
            // The mail layout's header and footer show the app name: make it the platform's.
            config(['app.name' => $platform]);
            Mail::to($user->email, $user->name)->send($make($platform));
        } catch (Throwable $e) {
            report($e);
        }
    }
}
