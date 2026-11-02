<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Support chat (docs/DATABASE_SCHEMA.md, "Support chat"): each account has
 * one running conversation with the platform owner, who answers every
 * organization's users from the owner console. Clients poll for new
 * messages; there is no websocket server.
 *
 * Read positions are message ids, so "unread" is just "newer than this".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete(); // one thread per account
            $table->enum('status', ['open', 'closed'])->default('open'); // a new message from the user reopens it
            $table->timestamp('last_message_at')->nullable();
            $table->string('last_message_preview', 200)->nullable();
            $table->boolean('last_message_from_support')->default(false);
            $table->unsignedBigInteger('user_read_message_id')->default(0); // last message the user has seen
            $table->unsignedBigInteger('support_read_message_id')->default(0); // last message the owner has seen
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'last_message_at']);
        });

        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('from_support'); // true = the platform owner
            $table->text('body');
            $table->timestamps();
            $table->index(['support_conversation_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('support_conversations');
    }
};
