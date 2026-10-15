<?php

namespace App\Http\Resources;

use App\Models\AuditEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AuditEvent */
class AuditEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'occurred_at' => $this->occurred_at,
            /** e.g. stock.recorded, delivery_note.confirmed, user.deactivated, product.updated. */
            'action' => $this->action,
            /** What the action is about: stock, deliveries, accounts, catalog, facilities or alerts. */
            'category' => self::category($this->action),
            'summary' => $this->summary,
            /** Null when no person is known (history from before the log existed). */
            'actor' => $this->actor ? ['id' => $this->actor->id, 'name' => $this->actor->name, 'role' => $this->actor->role] : null,
            /** @var array{facility: string|null, lga: string|null, state: string|null} */
            'place' => [
                'facility' => $this->facility?->name,
                'lga' => $this->lga?->name,
                'state' => $this->state?->name,
            ],
            /** @var array{type: string|null, id: int|null} */
            'subject' => ['type' => $this->subject_type, 'id' => $this->subject_id],
            /**
             * Edits: { field: [before, after] }; creations: the values set.
             *
             * @var array<string, mixed>|null
             */
            'changes' => $this->changes,
        ];
    }

    /** @return 'stock'|'deliveries'|'accounts'|'catalog'|'facilities'|'alerts' */
    public static function category(string $action): string
    {
        return self::CATEGORIES[strtok($action, '.')] ?? 'stock';
    }

    /** Action prefix → category, for display and the ?category= filter. */
    public const CATEGORIES = [
        'stock' => 'stock',
        'delivery_note' => 'deliveries',
        'dispatch' => 'deliveries',
        'user' => 'accounts',
        'auth' => 'accounts',
        'product' => 'catalog',
        'facility' => 'facilities',
        'alert' => 'alerts',
    ];
}
