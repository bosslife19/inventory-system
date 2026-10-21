<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The min / EOP / max each status row was judged against (StockLevels:
 * months of AMC where there is one, else the fixed levels), so reports read
 * the same thresholds the level and alerts came from. Null until the row is
 * next refreshed (any ledger write, or the daily stock:refresh-status).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_product_status', function (Blueprint $table) {
            $table->integer('min_stock_level')->nullable()->after('level');
            $table->integer('reorder_level')->nullable()->after('min_stock_level');
            $table->integer('max_stock_level')->nullable()->after('reorder_level');
            $table->enum('levels_source', ['amc', 'facility', 'catalog'])->nullable()->after('max_stock_level');
        });
    }

    public function down(): void
    {
        Schema::table('facility_product_status', function (Blueprint $table) {
            $table->dropColumn(['min_stock_level', 'reorder_level', 'max_stock_level', 'levels_source']);
        });
    }
};
