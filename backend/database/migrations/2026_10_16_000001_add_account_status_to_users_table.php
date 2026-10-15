<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Account management (docs/DATABASE_SCHEMA.md): accounts are deactivated,
 * never deleted, so the Stock Card's performed_by history stays intact; and
 * a temporary password set by whoever created or reset the account has to
 * be changed at the next sign-in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('state_id');
            $table->boolean('must_change_password')->default(false)->after('is_active');
            $table->foreignId('created_by')->nullable()->after('must_change_password')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['is_active', 'must_change_password']);
        });
    }
};
