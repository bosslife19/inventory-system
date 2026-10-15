<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Stores (docs/DATABASE_SCHEMA.md): every LGA, every state and the nation
 * get one store — a facility row with store_level set — so officers keep a
 * Stock Card of their own on the same ledger as the SDPs. A store issues
 * stock down the chain as a dispatch: an `issue` on its own card plus a
 * draft delivery note at the receiver, who confirms it into receipts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facilities', function (Blueprint $table) {
            // State and national stores sit above any LGA.
            $table->foreignId('lga_id')->nullable()->change();
            // Set only for state stores; everything else reaches its state through the LGA.
            $table->foreignId('state_id')->nullable()->after('lga_id')->constrained()->restrictOnDelete();
            // Null for SDPs.
            $table->enum('store_level', ['lga', 'state', 'national'])->nullable()->after('type');
            // "lga:12", "state:3", "national" — one store per node; null (distinct) for SDPs.
            $table->string('store_key', 32)->nullable()->unique()->after('store_level');
        });

        Schema::table('delivery_notes', function (Blueprint $table) {
            // Set when another facility in the system dispatched it (vs. a supplier).
            $table->foreignId('source_facility_id')->nullable()->after('source')->constrained('facilities')->restrictOnDelete();
            $table->date('dispatched_date')->nullable()->after('source_facility_id');
            $table->index(['source_facility_id', 'status']);
        });

        Schema::table('delivery_note_items', function (Blueprint $table) {
            // The issue on the sender's Stock Card that sent this line.
            $table->foreignId('source_transaction_id')->nullable()->after('stock_transaction_id')->constrained('stock_transactions')->restrictOnDelete();
            // The receipt back onto the sender's card when the receiver rejected the delivery.
            $table->foreignId('return_transaction_id')->nullable()->after('source_transaction_id')->constrained('stock_transactions')->restrictOnDelete();
        });

        $this->createStores();
    }

    /** Same as Facility::ensureStores(), without depending on app code. */
    private function createStores(): void
    {
        $now = now();

        DB::table('facilities')->insertOrIgnore([
            'name' => 'National Store', 'type' => 'warehouse', 'store_level' => 'national', 'store_key' => 'national',
            'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
        ]);

        foreach (DB::table('states')->get(['id', 'name']) as $state) {
            DB::table('facilities')->insertOrIgnore([
                'state_id' => $state->id, 'name' => "{$state->name} State Store", 'type' => 'warehouse',
                'store_level' => 'state', 'store_key' => "state:{$state->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        foreach (DB::table('lgas')->get(['id', 'name'])->chunk(500) as $chunk) {
            DB::table('facilities')->insertOrIgnore($chunk->map(fn ($lga) => [
                'lga_id' => $lga->id, 'name' => "{$lga->name} LGA Store", 'type' => 'warehouse',
                'store_level' => 'lga', 'store_key' => "lga:{$lga->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ])->all());
        }
    }

    public function down(): void
    {
        Schema::table('delivery_note_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('return_transaction_id');
            $table->dropConstrainedForeignId('source_transaction_id');
        });

        Schema::table('delivery_notes', function (Blueprint $table) {
            $table->dropIndex(['source_facility_id', 'status']);
            $table->dropConstrainedForeignId('source_facility_id');
            $table->dropColumn('dispatched_date');
        });

        // Stores that never recorded anything can go; ones with history block the rollback.
        DB::table('facilities')->whereNotNull('store_level')
            ->whereNotExists(fn ($q) => $q->from('stock_transactions')->whereColumn('stock_transactions.facility_id', 'facilities.id'))
            ->whereNotExists(fn ($q) => $q->from('delivery_notes')->whereColumn('delivery_notes.facility_id', 'facilities.id'))
            ->delete();

        Schema::table('facilities', function (Blueprint $table) {
            $table->dropUnique(['store_key']);
            $table->dropColumn(['store_level', 'store_key']);
            $table->dropConstrainedForeignId('state_id');
            $table->foreignId('lga_id')->nullable(false)->change();
        });
    }
};
