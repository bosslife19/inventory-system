<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - products.pack_size: pieces in each pack / box / carton; products.created_by
 *   (any level may now add products).
 * - The EOP moves below the minimum: alerts fire at the EOP, and "below min"
 *   just means time to order. Existing rows had min ≤ EOP, so the two values
 *   are swapped, which keeps every product's thresholds where they were.
 * - facility_product_levels: a facility's or store's own min / EOP / max for
 *   a product, overriding the catalog's.
 * - notifications: what each user was told (per-alert and digest), read state.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('pack_size')->nullable()->after('unit_of_measure');
            $table->foreignId('created_by')->nullable()->after('is_active')->constrained('users');
        });

        DB::table('products')->update(['unit_of_measure' => DB::raw('LOWER(TRIM(unit_of_measure))')]);
        // Row by row: MySQL applies SET clauses left to right, so a one-statement swap would copy instead.
        foreach (DB::table('products')->get(['id', 'min_stock_level', 'reorder_level']) as $p) {
            [$min, $eop] = $p->reorder_level >= $p->min_stock_level
                ? [$p->reorder_level, $p->reorder_level === $p->min_stock_level ? intdiv($p->min_stock_level, 2) : $p->min_stock_level]
                : [$p->min_stock_level, $p->reorder_level];
            DB::table('products')->where('id', $p->id)->update(['min_stock_level' => $min, 'reorder_level' => $eop]);
        }

        Schema::create('facility_product_levels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained();
            $table->foreignId('product_id')->constrained();
            $table->unsignedInteger('min_stock_level');
            $table->unsignedInteger('reorder_level'); // this facility's EOP
            $table->unsignedInteger('max_stock_level');
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->unique(['facility_id', 'product_id']);
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained();
            $table->string('type', 20); // alert | digest
            $table->foreignId('alert_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('body', 1000);
            $table->json('data')->nullable();
            $table->timestamp('pushed_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('facility_product_levels');
        foreach (DB::table('products')->whereColumn('reorder_level', '<', 'min_stock_level')->get(['id', 'min_stock_level', 'reorder_level']) as $p) {
            DB::table('products')->where('id', $p->id)->update(['min_stock_level' => $p->reorder_level, 'reorder_level' => $p->min_stock_level]);
        }
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn('pack_size');
        });
    }
};
