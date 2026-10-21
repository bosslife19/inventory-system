<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One entry in the audit log. Append-only: written by App\Support\AuditLog, never edited. */
class AuditEvent extends Model
{
    use BelongsToOrganization;

    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'occurred_at', 'actor_id', 'action', 'subject_type', 'subject_id',
        'facility_id', 'lga_id', 'state_id', 'summary', 'changes', 'ip',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'changes' => 'array',
        ];
    }

    /** The owner's own actions (organizations, plans) belong to none. */
    protected function requiresOrganization(): bool
    {
        return false;
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function lga(): BelongsTo
    {
        return $this->belongsTo(Lga::class);
    }

    public function state(): BelongsTo
    {
        return $this->belongsTo(State::class);
    }
}
