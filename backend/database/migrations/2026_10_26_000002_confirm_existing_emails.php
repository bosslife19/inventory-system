<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * Email confirmation (docs/API_CONTRACT.md, "Auth"): people who sign up
 * must confirm their email before using the system. Every account that
 * exists already is taken as confirmed, so nobody is locked out by it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')->whereNull('email_verified_at')->update(['email_verified_at' => now()]);
    }

    public function down(): void
    {
        // Nothing to undo: which were confirmed before isn't known.
    }
};
