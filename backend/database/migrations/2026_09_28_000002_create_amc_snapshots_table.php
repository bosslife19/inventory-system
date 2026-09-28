<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The Excel "Bin Card" summary, one row per facility + product + month
 * (docs/DATABASE_SCHEMA.md, "Consumption & reordering"). Written by the
 * scheduled stock:compute-amc; a re-run for the same month overwrites.
 *
 * period_month is the month the snapshot is for; AMC is averaged over the
 * complete months before it. months_of_stock and suggested_reorder_quantity
 * record the position at computation time — the live endpoint recomputes
 * them against current stock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('amc_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->date('period_month');
            // Null when there is no complete month of history yet.
            $table->decimal('amc_quantity', 12, 2)->nullable();
            $table->unsignedTinyInteger('months_used');
            $table->decimal('months_of_stock', 8, 2)->nullable();
            $table->unsignedInteger('suggested_reorder_quantity');
            $table->timestamp('created_at')->nullable();

            $table->unique(['facility_id', 'product_id', 'period_month'], 'amc_snapshots_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('amc_snapshots');
    }
};
