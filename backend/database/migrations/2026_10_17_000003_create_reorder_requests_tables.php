<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reorder requests (requisitions): an SDP, LGA store or state store asks a
 * store above it for stock. The supplier fulfils one by dispatching
 * (delivery_note_id), or rejects it; the requester may cancel while pending.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reorder_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained(); // who is asking
            $table->foreignId('supplier_facility_id')->constrained('facilities'); // the store asked
            $table->string('status', 20)->default('pending'); // pending | fulfilled | rejected | cancelled
            $table->text('comments')->nullable();
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('responded_by')->nullable()->constrained('users');
            $table->timestamp('responded_at')->nullable();
            $table->string('response_note', 1000)->nullable();
            $table->foreignId('delivery_note_id')->nullable()->constrained(); // the dispatch that fulfilled it
            $table->string('client_reference', 64)->nullable();
            $table->timestamps();
            $table->index(['supplier_facility_id', 'status']);
            $table->index(['facility_id', 'status']);
            $table->unique(['facility_id', 'client_reference']);
        });

        Schema::create('reorder_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reorder_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained();
            $table->unsignedInteger('quantity_requested');
            $table->unsignedInteger('quantity_supplied')->nullable(); // set on fulfilment
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reorder_request_items');
        Schema::dropIfExists('reorder_requests');
    }
};
