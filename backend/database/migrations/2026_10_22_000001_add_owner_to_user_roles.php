<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The platform owner's role (2026_10_21_000002_create_organizations): users.role
 * is an enum, and on MySQL it still only listed the original roles, so
 * creating an owner failed with "Data truncated for column 'role'".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['sdp_staff', 'lga_officer', 'state_officer', 'federal_officer', 'admin', 'owner'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['sdp_staff', 'lga_officer', 'state_officer', 'federal_officer', 'admin'])->change();
        });
    }
};
