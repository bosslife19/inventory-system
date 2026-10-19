<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * - stock_transactions.count_difference: for a physical inventory row, the
 *   counted quantity minus what the ledger held before (negative = stock
 *   found short). Shown in the Stock Card's Loss / Adj. column. Existing
 *   rows are backfilled from the running balances either side of them.
 * - facility_product_amcs: an AMC a facility or store enters for a product
 *   while it has too little history of its own (e.g. newly onboarded).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->integer('count_difference')->nullable()->after('running_balance');
        });

        // Only the batch counted changes, so the product's running balance moves by the same amount.
        foreach (DB::table('stock_transactions')->where('transaction_type', 'physical_count')->orderBy('id')->get(['id', 'facility_id', 'product_id', 'running_balance']) as $count) {
            $before = DB::table('stock_transactions')
                ->where('facility_id', $count->facility_id)
                ->where('product_id', $count->product_id)
                ->where('id', '<', $count->id)
                ->orderByDesc('id')
                ->value('running_balance');
            DB::table('stock_transactions')->where('id', $count->id)->update(['count_difference' => $count->running_balance - (int) $before]);
        }

        Schema::create('facility_product_amcs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained();
            $table->foreignId('product_id')->constrained();
            $table->decimal('amc_quantity', 12, 2);
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->unique(['facility_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_product_amcs');
        Schema::table('stock_transactions', function (Blueprint $table) {
            $table->dropColumn('count_difference');
        });
    }
};
