<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Delivery notes (docs/DATABASE_SCHEMA.md): an incoming shipment, captured on
 * the phone (on-device OCR, then reviewed by staff) or entered by hand. A
 * draft never touches the ledger; confirming it posts one receipt per item
 * through StockLedgerService and links each item to its stock_transactions
 * row — the digital equivalent of signing for a delivery.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained()->restrictOnDelete();
            $table->string('delivery_note_no', 100)->nullable();
            $table->string('source'); // supplier / warehouse — becomes the receipts' counterparty
            $table->date('received_date');
            $table->enum('status', ['draft', 'confirmed', 'rejected'])->default('draft');
            // Kept for a future photo upload; on-device OCR means none is sent today.
            $table->string('scanned_document_path')->nullable();
            // How the lines were captured, for audit: typed in, or read by OCR and reviewed.
            $table->enum('capture_method', ['manual', 'ocr'])->default('manual');
            $table->text('comments')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            // Idempotency key from offline clients, like stock_transactions.client_reference.
            $table->string('client_reference', 64)->nullable();
            $table->timestamps();

            $table->unique(['facility_id', 'client_reference'], 'delivery_notes_client_ref_unique');
            $table->index(['facility_id', 'status', 'received_date']);
        });

        Schema::create('delivery_note_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_note_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('batch_no', 100)->nullable(); // null for products without batch tracking
            $table->date('expiry_date')->nullable();
            $table->unsignedInteger('quantity');
            // Set on confirmation: the receipt this line became.
            $table->foreignId('stock_transaction_id')->nullable()->constrained()->restrictOnDelete();
            $table->timestamps();
        });

        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->foreign('delivery_note_id')->references('id')->on('delivery_notes')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->dropForeign(['delivery_note_id']);
        });
        Schema::dropIfExists('delivery_note_items');
        Schema::dropIfExists('delivery_notes');
    }
};
