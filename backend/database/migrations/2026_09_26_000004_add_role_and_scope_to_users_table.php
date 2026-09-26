<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Separate from the default users migration because these foreign keys
 * need states/lgas/facilities to exist first.
 *
 * Exactly one of facility_id / lga_id / state_id is set, matching role
 * (none for federal_officer / admin). Enforced in the app layer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['sdp_staff', 'lga_officer', 'state_officer', 'federal_officer', 'admin'])
                ->after('password');
            $table->foreignId('facility_id')->nullable()->after('role')->constrained()->restrictOnDelete();
            $table->foreignId('lga_id')->nullable()->after('facility_id')->constrained()->restrictOnDelete();
            $table->foreignId('state_id')->nullable()->after('lga_id')->constrained()->restrictOnDelete();
            $table->string('fcm_token')->nullable()->after('state_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('facility_id');
            $table->dropConstrainedForeignId('lga_id');
            $table->dropConstrainedForeignId('state_id');
            $table->dropColumn(['role', 'fcm_token']);
        });
    }
};
