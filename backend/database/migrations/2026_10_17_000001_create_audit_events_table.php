<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The audit log (docs/DATABASE_SCHEMA.md): one append-only row per thing a
 * person did — a Stock Card entry, a delivery confirmed, an account
 * deactivated, a product's levels changed. facility_id / lga_id / state_id
 * say where it happened, so the log is scoped like everything else; all
 * null means national (e.g. the product catalog). Earlier history is filled
 * in by `php artisan audit:backfill`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->timestamp('occurred_at')->index();
            // Null for system actions (none yet) and for history with no known actor.
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 50)->index(); // e.g. stock.recorded, user.deactivated
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->foreignId('facility_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('lga_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('state_id')->nullable()->constrained()->nullOnDelete();
            $table->string('summary', 500);
            // Edits: { field: [before, after] }. Creations: the values set.
            $table->json('changes')->nullable();
            $table->string('ip', 45)->nullable();

            $table->index(['state_id', 'occurred_at']);
            $table->index(['lga_id', 'occurred_at']);
            $table->index(['facility_id', 'occurred_at']);
            $table->index(['actor_id', 'occurred_at']);
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
