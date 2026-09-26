<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Append-only ledger — the digital Stock Card. Never update or delete rows;
 * corrections are new adjustment_in / adjustment_out rows.
 *
 * quantity is always positive; direction comes from transaction_type:
 *   +  receipt, transfer_in, adjustment_in
 *   -  issue, loss, transfer_out, adjustment_out
 *   =  physical_count (sets the balance to the counted quantity)
 *
 * running_balance is per facility + product (all batches), matching the
 * STOCK BALANCE column of the paper Stock Card.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->restrictOnDelete();
            $table->date('transaction_date');
            $table->string('voucher_no')->nullable();
            $table->string('counterparty')->nullable(); // required for receipt/issue/transfer_* only
            $table->enum('transaction_type', [
                'receipt', 'issue', 'loss',
                'adjustment_in', 'adjustment_out',
                'physical_count', 'transfer_in', 'transfer_out',
            ]);
            $table->unsignedInteger('quantity');
            $table->text('comments')->nullable();
            $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            // FK to delivery_notes is added in Phase 4 when that table exists.
            $table->unsignedBigInteger('delivery_note_id')->nullable()->index();
            $table->integer('running_balance');
            $table->timestamps();

            // Stock Card history view: one facility+product in date order.
            $table->index(['facility_id', 'product_id', 'transaction_date', 'id'], 'stock_tx_card_idx');
            $table->index(['facility_id', 'transaction_type', 'transaction_date'], 'stock_tx_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_transactions');
    }
};
