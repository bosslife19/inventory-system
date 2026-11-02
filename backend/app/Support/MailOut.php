<?php

namespace App\Support;

use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Every email the system sends goes through here. Inline (no queue — shared
 * hosting, see docs/ARCHITECTURE.md), after the surrounding transaction
 * commits so a rolled-back action never emails anyone, and best effort: a
 * mail failure is reported, never thrown, so it can't undo what it announces.
 */
final class MailOut
{
    /** @param  callable(string $platform): Mailable  $make  given the platform's name, for subjects and sign-offs */
    public static function send(string $email, ?string $name, callable $make): void
    {
        DB::afterCommit(function () use ($email, $name, $make) {
            try {
                $platform = Platform::branding()['name'];
                // The mail layout's header and footer show the app name: make it the platform's.
                config(['app.name' => $platform]);
                Mail::to($email, $name)->send($make($platform));
            } catch (Throwable $e) {
                report($e);
            }
        });
    }

    /** A page of the web app, for links in emails. */
    public static function frontend(string $path = ''): string
    {
        return config('app.frontend_url').'/'.ltrim($path, '/');
    }
}
