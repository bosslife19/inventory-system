<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Derived from stock_transactions. Maintained inline by
 * StockLedgerService::record() and corrected nightly by the
 * ReconcileStockBalances command. Never written from a controller.
 *
 * batch_key = COALESCE(batch_id, 0) so the unique index also covers
 * non-batch-tracked products (NULLs are distinct in unique indexes).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('batch_key')->storedAs('COALESCE(batch_id, 0)');
            $table->integer('quantity_on_hand');
            $table->foreignId('last_transaction_id')->constrained('stock_transactions')->restrictOnDelete();
            $table->timestamp('updated_at')->nullable();

            $table->unique(['facility_id', 'product_id', 'batch_key'], 'stock_balances_unique');
            $table->index(['product_id', 'facility_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_balances');
    }
};
