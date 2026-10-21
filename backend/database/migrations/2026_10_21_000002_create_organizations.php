<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Organizations (docs/DATABASE_SCHEMA.md): each partner is a separate tenant
 * with its own facilities, stores, product catalog, accounts and audit log.
 * The places (states, LGAs) stay shared reference data. Everything already
 * in the database becomes the first organization, on the paid plan with no
 * end date, so nothing that works today stops working.
 *
 * The platform owner's accounts (role owner) belong to no organization;
 * the owner's own name and logo, shown beside each organization's, live in
 * platform_settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('logo_path')->nullable(); // on the local disk, served by GET /organizations/{id}/logo
            $table->string('contact_name')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->string('address', 500)->nullable();
            $table->enum('plan', ['free', 'paid'])->default('free');
            $table->date('paid_until')->nullable(); // last day of the paid plan; null = no end date
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable(); // the owner's own notes, never shown to the organization
            $table->timestamps();
        });

        Schema::create('platform_settings', function (Blueprint $table) {
            $table->string('key', 50)->primary();
            $table->text('value')->nullable();
        });

        $now = now();
        $orgId = DB::table('organizations')->insertGetId([
            'name' => 'Default organization', 'plan' => 'paid', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
        ]);

        foreach (['facilities', 'products', 'users', 'audit_events'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->foreignId('organization_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            });
            DB::table($table)->update(['organization_id' => $orgId]);
        }

        // Users stay nullable (the owner); audit events too (the owner's actions).
        Schema::table('facilities', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable(false)->change();
            $table->dropUnique(['store_key']);
            $table->unique(['organization_id', 'store_key']);
        });
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable(false)->change();
            $table->dropUnique(['sku']);
            $table->unique(['organization_id', 'sku']);
        });
        Schema::table('audit_events', function (Blueprint $table) {
            $table->index(['organization_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::table('audit_events', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'occurred_at']);
        });
        Schema::table('products', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'sku']);
            $table->unique('sku');
        });
        Schema::table('facilities', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'store_key']);
            $table->unique('store_key');
        });
        foreach (['audit_events', 'users', 'products', 'facilities'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropConstrainedForeignId('organization_id');
            });
        }
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('organizations');
    }
};
