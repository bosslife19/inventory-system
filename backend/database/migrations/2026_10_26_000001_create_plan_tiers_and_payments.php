<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Paid plan tiers and Paystack payments (docs/DATABASE_SCHEMA.md,
 * "Organizations"). A tier caps open facilities and active accounts; every
 * paid tier unlocks the same features. The platform owner edits tiers and
 * prices from the console; organization admins pay for one through Paystack
 * for 1–12 months, which moves paid_until on.
 *
 * Organizations already on the paid plan keep plan_tier_id null: no limits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plan_tiers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('description', 500)->nullable();
            $table->unsignedInteger('monthly_price'); // whole naira
            $table->unsignedInteger('max_facilities')->nullable(); // open SDPs; null = no limit
            $table->unsignedInteger('max_accounts')->nullable(); // active accounts, every role; null = no limit
            $table->boolean('is_active')->default(true); // offered to organizations
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('organizations', function (Blueprint $table) {
            $table->foreignId('plan_tier_id')->nullable()->after('plan')->constrained()->nullOnDelete();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('plan_tier_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // the admin who paid
            $table->string('reference', 64)->unique(); // ours, sent to Paystack
            $table->unsignedTinyInteger('months');
            $table->unsignedBigInteger('amount_kobo'); // fixed at checkout
            $table->string('currency', 3)->default('NGN');
            $table->enum('status', ['pending', 'success', 'failed', 'abandoned'])->default('pending');
            $table->string('channel', 30)->nullable(); // card, bank_transfer, ussd, ...
            $table->unsignedBigInteger('gateway_id')->nullable(); // Paystack's transaction id
            $table->string('failure_reason', 255)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->date('period_start')->nullable(); // set on success
            $table->date('period_end')->nullable();
            $table->unsignedSmallInteger('credit_days')->default(0); // days carried over from another tier
            $table->timestamps();
            $table->index(['organization_id', 'created_at']);
        });

        // Starter tiers; the owner sets the real prices and limits in the console.
        $now = now();
        DB::table('plan_tiers')->insert([
            ['name' => 'Starter', 'description' => 'A few facilities and a small team.', 'monthly_price' => 25000, 'max_facilities' => 5, 'max_accounts' => 15, 'sort_order' => 1, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Standard', 'description' => 'An LGA or a small state programme.', 'monthly_price' => 75000, 'max_facilities' => 25, 'max_accounts' => 75, 'sort_order' => 2, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Enterprise', 'description' => 'No limits on facilities or accounts.', 'monthly_price' => 200000, 'max_facilities' => null, 'max_accounts' => null, 'sort_order' => 3, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('plan_tier_id');
        });
        Schema::dropIfExists('plan_tiers');
    }
};
