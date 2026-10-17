<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Models\User;
use App\Models\UserNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Tells some users one thing: an in-app notification row each, and a push
 * to those with a registered device. Push is best effort — a failure is
 * reported, never thrown, so it can't undo the action being announced.
 * Tokens FCM reports as dead are forgotten.
 */
class UserNotifier
{
    public function __construct(private readonly PushSender $push) {}

    /**
     * @param  Collection<int, User>  $users
     * @param  array<string, mixed>  $payload  stored with the notification; pushed as strings (nested values as JSON)
     */
    public function send(Collection $users, string $type, string $title, string $body, array $payload = [], ?int $alertId = null, ?CarbonImmutable $at = null): void
    {
        $users = $users->unique('id')->values();
        if ($users->isEmpty()) {
            return;
        }
        $at ??= CarbonImmutable::now();

        $tokens = $users->pluck('fcm_token')->filter()->unique()->values()->all();
        $dead = [];
        $pushed = false;
        if ($tokens !== []) {
            try {
                $data = array_map(fn ($v) => is_scalar($v) ? (string) $v : json_encode($v), ['type' => $type, ...$payload]);
                $dead = $this->push->send($tokens, $title, $body, $data);
                $pushed = true;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        UserNotification::insert($users->map(fn (User $u) => [
            'user_id' => $u->id,
            'type' => $type,
            'alert_id' => $alertId,
            'title' => $title,
            'body' => mb_strimwidth($body, 0, 1000, '…'),
            'data' => json_encode($payload),
            'pushed_at' => $pushed && $u->fcm_token && ! in_array($u->fcm_token, $dead, true) ? $at : null,
            'created_at' => $at,
            'updated_at' => $at,
        ])->all());

        if ($dead !== []) {
            User::whereIn('fcm_token', $dead)->update(['fcm_token' => null]);
        }
    }
}
