<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An account's running support chat with the platform owner — one per
 * account, reopened by the next message after it was closed.
 *
 * @property int $user_read_message_id
 * @property int $support_read_message_id
 */
class SupportConversation extends Model
{
    use BelongsToOrganization;

    public const OPEN = 'open';

    public const CLOSED = 'closed';

    protected $fillable = [
        'organization_id', 'user_id', 'status', 'last_message_at', 'last_message_preview', 'last_message_from_support',
        'user_read_message_id', 'support_read_message_id', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'last_message_from_support' => 'boolean',
            'closed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SupportMessage::class);
    }

    /** Owner replies the user hasn't seen yet. */
    public function unreadForUser(): int
    {
        return $this->messages()->where('from_support', true)->where('id', '>', $this->user_read_message_id)->count();
    }
}
