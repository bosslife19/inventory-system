<?php

namespace App\Http\Resources;

use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin UserNotification */
class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** @var 'alert'|'digest' */
            'type' => $this->type,
            /** The alert it is about (type "alert"); null for digests. */
            'alert_id' => $this->alert_id,
            'title' => $this->title,
            'body' => $this->body,
            /**
             * Named payload, not data: a resource with a "data" key isn't wrapped in one.
             * alert: { alert_id, alert_type, facility_id, url }; digest: { url, counts: { stock_out, expired,
             * low_stock, expiring_soon }, facility_count, since }.
             *
             * @var array<string, mixed>|null
             */
            'payload' => $this->data,
            'created_at' => $this->created_at,
            /** Null when it wasn't pushed (no device registered, or the push failed). */
            'pushed_at' => $this->pushed_at,
            'read_at' => $this->read_at,
        ];
    }
}
