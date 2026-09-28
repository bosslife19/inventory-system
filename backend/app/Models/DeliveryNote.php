<?php

namespace App\Models;

use App\Casts\DateOnly;
use App\Enums\DeliveryNoteStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** An incoming shipment. Drafts never touch the ledger; DeliveryNoteService::confirm() posts it. */
class DeliveryNote extends Model
{
    protected $fillable = [
        'facility_id', 'delivery_note_no', 'source', 'received_date', 'status', 'scanned_document_path',
        'capture_method', 'comments', 'created_by', 'confirmed_by', 'confirmed_at', 'rejected_by',
        'rejected_at', 'rejection_reason', 'client_reference',
    ];

    protected function casts(): array
    {
        return [
            'received_date' => DateOnly::class,
            'status' => DeliveryNoteStatus::class,
            'confirmed_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(DeliveryNoteItem::class)->orderBy('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function rejecter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }
}
