<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('batch_no');
            $table->date('manufacture_date')->nullable();
            $table->date('expiry_date')->index();
            $table->timestamps();

            $table->unique(['product_id', 'batch_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batches');
    }
};
