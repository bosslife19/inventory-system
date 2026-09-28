<?php

namespace App\Models;

use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AlertType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Raised and auto-resolved by AlertEngine; acknowledged or resolved by users
 * via the API. See the alerts migration for the "live" (condition_cleared_at)
 * rule.
 */
class Alert extends Model
{
    protected $fillable = [
        'facility_id', 'product_id', 'batch_id', 'alert_type', 'severity', 'status',
        'acknowledged_at', 'acknowledged_by', 'resolved_at', 'resolved_by', 'condition_cleared_at',
    ];

    protected function casts(): array
    {
        return [
            'alert_type' => AlertType::class,
            'severity' => AlertSeverity::class,
            'status' => AlertStatus::class,
            'acknowledged_at' => 'datetime',
            'resolved_at' => 'datetime',
            'condition_cleared_at' => 'datetime',
        ];
    }

    /** The condition that raised it still holds. */
    public function scopeLive(Builder $query): void
    {
        $query->whereNull('condition_cleared_at');
    }

    /** "type:product:batch" — identifies the condition an alert is about. */
    public function conditionKey(): string
    {
        return self::key($this->alert_type, $this->product_id, $this->batch_id);
    }

    public static function key(AlertType $type, int $productId, ?int $batchId): string
    {
        return "{$type->value}:{$productId}:".($batchId ?? '-');
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function acknowledger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
