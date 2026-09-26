<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facilities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lga_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->enum('type', ['health_center', 'hospital', 'pharmacy', 'warehouse', 'other']);
            $table->string('address')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('phone')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['lga_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facilities');
    }
};
