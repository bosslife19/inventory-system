<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Idempotency key for offline clients (mobile/CLAUDE.md rule 2). The mobile
 * outbox gives every queued entry a UUID; if a sync attempt's response is
 * lost and the entry is sent again, StockLedgerService returns the row
 * already recorded instead of writing it twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->string('client_reference', 64)->nullable()->after('delivery_note_id');
            $table->unique(['facility_id', 'client_reference'], 'stock_tx_client_ref_unique');
        });
    }

    public function down(): void
    {
        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->dropUnique('stock_tx_client_ref_unique');
            $table->dropColumn('client_reference');
        });
    }
};
