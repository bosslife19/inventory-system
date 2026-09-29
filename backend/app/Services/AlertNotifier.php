<?php

namespace App\Services;

use App\Contracts\PushSender;
use App\Enums\AlertType;
use App\Enums\UserRole;
use App\Models\Alert;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

/**
 * Push notifications for newly raised alerts, to the staff of the facility
 * concerned (docs/ROLES_AND_PERMISSIONS.md). LGA / State / Federal digests
 * are not built yet.
 *
 * The payload carries alert_id so a tap opens the app on that alert
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

        $tokensByFacility = User::query()
            ->where('role', UserRole::SdpStaff)
            ->whereIn('facility_id', $alerts->pluck('facility_id')->unique())
            ->whereNotNull('fcm_token')
            ->get(['facility_id', 'fcm_token'])
            ->groupBy('facility_id')
            ->map(fn (Collection $users) => $users->pluck('fcm_token')->unique()->values()->all());

        $alerts->loadMissing(['product', 'batch']);
        $dead = [];

        foreach ($alerts as $alert) {
            $tokens = $tokensByFacility[$alert->facility_id] ?? [];
            if ($tokens === []) {
                continue;
            }
            [$title, $body] = $this->message($alert);
            $dead = [...$dead, ...$this->push->send($tokens, $title, $body, [
                'alert_id' => (string) $alert->id,
                'alert_type' => $alert->alert_type->value,
                'url' => "stockcard://alerts?focus={$alert->id}",
            ])];
        }

        if ($dead !== []) {
            User::whereIn('fcm_token', array_unique($dead))->update(['fcm_token' => null]);
        }
    }

    /** @return array{string, string} */
    private function message(Alert $alert): array
    {
        $product = $alert->product->name;
        $batch = $alert->batch;

        return match ($alert->alert_type) {
            AlertType::StockOut => ["Stock-out: {$product}", 'No usable stock left. Record a receipt when it arrives, or reorder now.'],
            AlertType::LowStock => ["Low stock: {$product}", 'Usable stock is below the minimum level. Time to reorder.'],
            AlertType::Expired => ["Expired batch: {$product}", "Batch {$batch?->batch_no} expired on {$batch?->expiry_date?->format('j M Y')}. Remove it from use and record it as a loss."],
            AlertType::ExpiringSoon => ["Expiring soon: {$product}", "Batch {$batch?->batch_no} expires on {$batch?->expiry_date?->format('j M Y')}. Issue it first."],
        };
    }
}
