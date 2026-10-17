<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Enums\AlertType;
use App\Enums\StoreLevel;
use App\Enums\UserRole;
use App\Models\Alert;
use App\Models\Facility;
use App\Models\User;
use App\Models\UserNotification;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

/**
 * Tells the people who keep a facility's Stock Card about each newly raised
 * alert there: SDP staff for their facility, the LGA / State / Federal
 * officers for their own store. Each gets an in-app notification row, and a
 * push when they have registered a device. Officers hear about the
 * facilities below them through the daily digest (AlertDigest) instead.
 *
 * The push payload carries alert_id so a tap opens the app on that alert
 * (mobile/CLAUDE.md rule 3). Tokens FCM reports as dead are forgotten.
 */
class AlertNotifier
{
    public function __construct(private readonly PushSender $push) {}

    /** @param  iterable<Alert>  $alerts  just raised */
    public function notify(iterable $alerts): void
    {
        $alerts = new EloquentCollection(is_array($alerts) ? $alerts : iterator_to_array($alerts, false));
        if ($alerts->isEmpty()) {
            return;
        }
        $alerts->loadMissing(['product', 'batch', 'facility']);

        $keepers = [];
        foreach ($alerts->pluck('facility')->unique('id') as $facility) {
            $keepers[$facility->id] = self::keepersOf($facility)->get(['id', 'fcm_token']);
        }

        $now = CarbonImmutable::now();
        $dead = [];

        foreach ($alerts as $alert) {
            $users = $keepers[$alert->facility_id];
            if ($users->isEmpty()) {
                continue;
            }
            [$title, $body] = $this->message($alert);
            $data = [
                'alert_id' => (string) $alert->id,
                'alert_type' => $alert->alert_type->value,
                'facility_id' => (string) $alert->facility_id,
                'url' => "stockcard://alerts?focus={$alert->id}",
            ];

            $tokens = $users->pluck('fcm_token')->filter()->unique()->values()->all();
            $deadNow = $tokens === [] ? [] : $this->push->send($tokens, $title, $body, $data);
            $dead = [...$dead, ...$deadNow];

            UserNotification::insert($users->map(fn (User $u) => [
                'user_id' => $u->id,
                'type' => UserNotification::TYPE_ALERT,
                'alert_id' => $alert->id,
                'title' => $title,
                'body' => $body,
                'data' => json_encode($data),
                'pushed_at' => $u->fcm_token && ! in_array($u->fcm_token, $deadNow, true) ? $now : null,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all());
        }

        if ($dead !== []) {
            User::whereIn('fcm_token', array_unique($dead))->update(['fcm_token' => null]);
        }
    }

    /**
     * Active accounts keeping this facility's Stock Card: its staff for an
     * SDP, the officers of the node for a store.
     *
     * @return Builder<User>
     */
    public static function keepersOf(Facility $facility): Builder
    {
        $query = User::query()->where('is_active', true);

        return match ($facility->store_level) {
            null => $query->where('role', UserRole::SdpStaff)->where('facility_id', $facility->id),
            StoreLevel::Lga => $query->where('role', UserRole::LgaOfficer)->where('lga_id', $facility->lga_id),
            StoreLevel::State => $query->where('role', UserRole::StateOfficer)->where('state_id', $facility->state_id),
            StoreLevel::National => $query->where('role', UserRole::FederalOfficer),
        };
    }

    /** @return array{string, string} */
    private function message(Alert $alert): array
    {
        $product = $alert->product->name;
        $batch = $alert->batch;
        $where = $alert->facility->isStore() ? " at {$alert->facility->name}" : '';

        return match ($alert->alert_type) {
            AlertType::StockOut => ["Stock-out: {$product}", "No usable stock left{$where}. Record a receipt when it arrives, or order now."],
            AlertType::LowStock => ["At EOP: {$product}", "Usable stock{$where} has reached the emergency order point (EOP). Order now."],
            AlertType::Expired => ["Expired batch: {$product}", "Batch {$batch?->batch_no}{$where} expired on {$batch?->expiry_date?->format('j M Y')}. Remove it from use and record it as a loss."],
            AlertType::ExpiringSoon => ["Expiring soon: {$product}", "Batch {$batch?->batch_no}{$where} expires on {$batch?->expiry_date?->format('j M Y')}. Issue it first."],
        };
    }
}
