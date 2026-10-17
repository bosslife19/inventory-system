<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Enums\AlertType;
use App\Enums\UserRole;
use App\Models\Alert;
use App\Models\Facility;
use App\Models\User;
use App\Models\UserNotification;
use App\Support\HierarchyScope;
use Carbon\CarbonImmutable;

/**
 * The LGA / State / Federal digest: one notification per officer (and admin)
 * summing up the alerts raised in their area since their last digest —
 * "3 stock-outs, 5 at EOP … across 6 facilities". Their own store's alerts
 * reach them one by one (AlertNotifier), so they're left out here.
 *
 * Run once a day by the scheduler (alerts:send-digests). "Since the last
 * digest" is read from the notifications table, so a re-run the same day
 * finds nothing new and sends nothing; the first ever covers a day.
 */
class AlertDigest
{
    public const ROLES = [UserRole::LgaOfficer, UserRole::StateOfficer, UserRole::FederalOfficer, UserRole::Admin];

    public function __construct(private readonly PushSender $push) {}

    /** @return int digests sent */
    public function sendAll(?CarbonImmutable $now = null): int
    {
        $now ??= CarbonImmutable::now();
        $sent = 0;

        User::query()
            ->where('is_active', true)
            ->whereIn('role', self::ROLES)
            ->with(['lga', 'state'])
            ->orderBy('id')
            ->chunkById(200, function ($users) use ($now, &$sent) {
                foreach ($users as $user) {
                    try {
                        $sent += $this->sendTo($user, $now) ? 1 : 0;
                    } catch (\Throwable $e) {
                        report($e); // one officer's failure mustn't stop everyone else's digest
                    }
                }
            });

        return $sent;
    }

    /** The digest for one officer, or null when nothing new was raised in their area. */
    public function sendTo(User $user, CarbonImmutable $now): ?UserNotification
    {
        $since = UserNotification::query()
            ->where('user_id', $user->id)
            ->where('type', UserNotification::TYPE_DIGEST)
            ->max('created_at');
        $since = $since ? CarbonImmutable::parse($since) : $now->subDay();

        $scope = HierarchyScope::for($user);
        $facilities = $scope->scopeFacilities(Facility::query())
            ->when($scope->ownStore(), fn ($q, Facility $store) => $q->whereKeyNot($store->id))
            ->select('facilities.id');

        $alerts = Alert::query()
            ->whereIn('facility_id', $facilities)
            ->where('created_at', '>', $since)
            ->where('created_at', '<=', $now);

        $byType = (clone $alerts)->groupBy('alert_type')->selectRaw('alert_type, count(*) as n')->pluck('n', 'alert_type');
        $total = (int) $byType->sum();
        if ($total === 0) {
            return null;
        }
        $facilityCount = (clone $alerts)->distinct()->count('facility_id');

        $counts = [];
        foreach (AlertType::cases() as $type) { // most severe first
            $counts[$type->value] = (int) ($byType[$type->value] ?? 0);
        }

        $area = $this->areaName($user);
        $title = "{$area}: {$total} new stock ".($total === 1 ? 'alert' : 'alerts');
        $body = $this->summary($counts).' across '.$facilityCount.' '.($facilityCount === 1 ? 'facility' : 'facilities').'.';
        $data = [
            'type' => UserNotification::TYPE_DIGEST,
            'url' => 'stockcard://notifications',
            'counts' => $counts,
            'facility_count' => $facilityCount,
            'since' => $since->toIso8601String(),
        ];

        $dead = $user->fcm_token
            ? $this->push->send([$user->fcm_token], $title, $body, ['type' => UserNotification::TYPE_DIGEST, 'url' => $data['url']])
            : [];
        if ($dead !== []) {
            User::whereIn('fcm_token', $dead)->update(['fcm_token' => null]);
        }

        return UserNotification::forceCreate([
            'user_id' => $user->id,
            'type' => UserNotification::TYPE_DIGEST,
            'title' => $title,
            'body' => $body,
            'data' => $data,
            'pushed_at' => $user->fcm_token && $dead === [] ? $now : null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /** "2 stock-outs, 3 at EOP, 1 expired batch" — only the kinds that occurred. */
    private function summary(array $counts): string
    {
        $phrase = [
            'stock_out' => fn (int $n) => $n === 1 ? '1 stock-out' : "{$n} stock-outs",
            'expired' => fn (int $n) => $n === 1 ? '1 expired batch' : "{$n} expired batches",
            'low_stock' => fn (int $n) => "{$n} at EOP",
            'expiring_soon' => fn (int $n) => $n === 1 ? '1 batch expiring soon' : "{$n} batches expiring soon",
        ];
        $parts = [];
        foreach ($counts as $type => $n) {
            if ($n > 0) {
                $parts[] = $phrase[$type]($n);
            }
        }

        return ucfirst(implode(', ', $parts));
    }

    private function areaName(User $user): string
    {
        return match ($user->role) {
            UserRole::LgaOfficer => "{$user->lga?->name} LGA",
            UserRole::StateOfficer => "{$user->state?->name} State",
            default => 'Nigeria',
        };
    }
}
