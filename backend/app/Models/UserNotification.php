<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Something a user was told: a new alert at a facility whose Stock Card they
 * keep (type "alert"), or an officer's digest of new alerts in their area
 * (type "digest"). Written by AlertNotifier / AlertDigest and pushed too when
 * the user has an FCM token (pushed_at). Table "notifications" — this app
 * doesn't use Laravel's database notifications, so the name is free.
 */
class UserNotification extends Model
{
    public const TYPE_ALERT = 'alert';

    public const TYPE_DIGEST = 'digest';

    protected $table = 'notifications';

    protected $fillable = ['user_id', 'type', 'alert_id', 'title', 'body', 'data', 'pushed_at', 'read_at'];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'pushed_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }

    public function scopeUnread(Builder $query): void
    {
        $query->whereNull('read_at');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function alert(): BelongsTo
    {
        return $this->belongsTo(Alert::class);
    }
}
