<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One message in a support chat, from the account (from_support false) or the platform owner. */
class SupportMessage extends Model
{
    protected $fillable = ['support_conversation_id', 'sender_id', 'from_support', 'body'];

    protected function casts(): array
    {
        return ['from_support' => 'boolean'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(SupportConversation::class, 'support_conversation_id');
    }

    /** The platform owner belongs to no organization, so the tenant filter mustn't hide them. */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id')->withoutGlobalScope(User::ORGANIZATION_SCOPE);
    }
}
