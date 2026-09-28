<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Stock alerts raised by AlertEngine (docs/DATABASE_SCHEMA.md, "Alerts").
 *
 * One alert per episode of a condition: (facility, product, batch, type).
 * condition_cleared_at is null while the condition that raised the alert
 * still holds — at most one such "live" row per key. A user resolving an
 * alert doesn't clear the condition, so it isn't re-raised until the
 * condition clears and recurs.
 *
 * batch_id is set for expiry alerts (expired / expiring_soon); stock-level
 * alerts (stock_out / low_stock) are per product and leave it null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->restrictOnDelete();
            $table->enum('alert_type', ['low_stock', 'expiring_soon', 'expired', 'stock_out']);
            $table->enum('severity', ['info', 'warning', 'critical']);
            $table->enum('status', ['open', 'acknowledged', 'resolved'])->default('open');
            $table->timestamp('acknowledged_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('resolved_at')->nullable();
            // Null with resolved_at set means the engine resolved it when the condition cleared.
            $table->foreignId('resolved_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('condition_cleared_at')->nullable();
            $table->timestamps();

            $table->index(['facility_id', 'status', 'severity'], 'alerts_list_idx');
            $table->index(['facility_id', 'condition_cleared_at'], 'alerts_live_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alerts');
    }
};
