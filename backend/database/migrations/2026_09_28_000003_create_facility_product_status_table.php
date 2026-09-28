<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Materialized StockStatusService output: one row per facility + product
 * stocked there (docs/DATABASE_SCHEMA.md, "Rollup tables"). State and
 * Federal rollups aggregate this with GROUP BY instead of reading every
 * stock_balances row live.
 *
 * Derived, never edited by hand: refreshed by StockStatusSnapshot after each
 * ledger write (for that product) and by the daily stock:refresh-status pass
 * (expiry changes with the date). Quantities here are for rollups only —
 * the facility's own screens still read stock_balances.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facility_product_status', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->integer('quantity_on_hand');
            $table->integer('usable_quantity');
            $table->integer('expired_quantity');
            $table->integer('expiring_soon_quantity');
            $table->enum('level', ['stock_out', 'low_stock', 'reorder', 'ok']);
            $table->boolean('flag_stock_out');
            $table->boolean('flag_expired');
            $table->boolean('flag_low_stock');
            $table->boolean('flag_expiring_soon');
            $table->date('last_transaction_date')->nullable();
            $table->timestamp('refreshed_at');

            $table->unique(['facility_id', 'product_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_product_status');
    }
};
