<?php

namespace App\Models;

use App\Enums\ReorderRequestStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A facility or store asking a store above it for stock (ReorderRequestService).
 * Fulfilled by a dispatch (delivery_note_id), which the requester then
 * confirms like any delivery.
 */
class ReorderRequest extends Model
{
    protected $fillable = [
        'facility_id', 'supplier_facility_id', 'status', 'comments', 'requested_by',
        'responded_by', 'responded_at', 'response_note', 'delivery_note_id', 'client_reference',
    ];

    protected function casts(): array
    {
        return [
            'status' => ReorderRequestStatus::class,
            'responded_at' => 'datetime',
        ];
    }

    /** REQ-000123 */
    public function number(): string
    {
        return sprintf('REQ-%06d', $this->id);
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Facility::class, 'supplier_facility_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ReorderRequestItem::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by');
    }

    public function deliveryNote(): BelongsTo
    {
        return $this->belongsTo(DeliveryNote::class);
    }
}
