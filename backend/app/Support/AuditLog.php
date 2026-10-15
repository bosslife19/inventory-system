<?php

namespace App\Support;

use App\Enums\TransactionType;
use App\Enums\UserRole;
use App\Models\AuditEvent;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Models\StockTransaction;
use App\Models\User;
use BackedEnum;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Writes the audit log (audit_events). Called by whatever performs an action,
 * inside the same DB transaction, so an action and its audit row stand or
 * fall together.
 *
 * "Where" decides who can read the entry (HierarchyScope::scopeAuditEvents):
 * a facility event is filed under that facility, its LGA and state; an
 * account change under the account's own node; catalog changes nationally.
 */
final class AuditLog
{
    /** Never shown, even as "changed". */
    private const HIDDEN = ['password', 'remember_token', 'fcm_token', 'updated_at', 'created_at'];

    /**
     * @param  array<string, mixed>|null  $changes
     */
    public static function record(
        string $action,
        string $summary,
        ?Model $subject = null,
        Facility|Lga|State|null $place = null,
        ?array $changes = null,
        ?User $actor = null,
        ?CarbonInterface $at = null,
    ): AuditEvent {
        $actor ??= Auth::user();

        return AuditEvent::create([
            'occurred_at' => $at ?? CarbonImmutable::now(),
            'actor_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subject ? self::subjectType($subject) : null,
            'subject_id' => $subject?->getKey(),
            ...self::where($place),
            'summary' => mb_strimwidth($summary, 0, 500, '…'),
            'changes' => $changes ?: null,
            'ip' => app()->runningInConsole() ? null : request()->ip(),
        ]);
    }

    /** @return array{facility_id: int|null, lga_id: int|null, state_id: int|null} */
    public static function where(Facility|Lga|State|null $place): array
    {
        return match (true) {
            $place instanceof Facility => ['facility_id' => $place->id, 'lga_id' => $place->lga_id, 'state_id' => $place->stateId()],
            $place instanceof Lga => ['facility_id' => null, 'lga_id' => $place->id, 'state_id' => $place->state_id],
            $place instanceof State => ['facility_id' => null, 'lga_id' => null, 'state_id' => $place->id],
            default => ['facility_id' => null, 'lga_id' => null, 'state_id' => null],
        };
    }

    /** Where an account lives: SDP staff at their facility, officers at their LGA / state, others nationally. */
    public static function placeOfUser(User $user): Facility|Lga|State|null
    {
        return match ($user->role) {
            UserRole::SdpStaff => $user->facility,
            UserRole::LgaOfficer => $user->lga,
            UserRole::StateOfficer => $user->state,
            default => null,
        };
    }

    /**
     * What changed in the last save, as { field: [before, after] }, leaving
     * out secrets and timestamps.
     *
     * @return array<string, array{mixed, mixed}>
     */
    public static function diff(Model $model): array
    {
        // After save() the "original" is already the new value; getPrevious() keeps the old one (raw).
        $previous = $model->getPrevious();
        $out = [];
        foreach ($model->getChanges() as $field => $after) {
            if (in_array($field, self::HIDDEN, true)) {
                continue;
            }
            $before = array_key_exists($field, $previous) ? $model->newInstance()->setRawAttributes([$field => $previous[$field]])->getAttribute($field) : null;
            $out[$field] = [self::plain($before), self::plain($model->getAttribute($field))];
        }

        return $out;
    }

    /**
     * The values a new record was created with, for the log.
     *
     * @param  list<string>  $fields
     * @return array<string, mixed>
     */
    public static function snapshot(Model $model, array $fields): array
    {
        return array_map(fn ($v) => self::plain($v), $model->only($fields));
    }

    /** "Issue 10 × AMX-250 (batch MD-123) to Kawo PHC — balance 25" */
    public static function stockSummary(StockTransaction $t, string $sku, ?string $batchNo): string
    {
        $type = $t->transaction_type instanceof TransactionType ? $t->transaction_type : TransactionType::from($t->transaction_type);
        $label = ucfirst(str_replace('_', ' ', $type->value));
        $party = $t->counterparty ? match (true) {
            $type->isInbound() => " from {$t->counterparty}",
            $type->isOutbound() => " to {$t->counterparty}",
            default => '',
        } : '';
        $qty = $type === TransactionType::PhysicalCount ? "count of {$t->quantity}" : "{$t->quantity} ×";

        return "{$label} {$qty} {$sku}".($batchNo ? " (batch {$batchNo})" : '')."{$party} — balance {$t->running_balance}";
    }

    private static function subjectType(Model $model): string
    {
        return strtolower(preg_replace('/(?<!^)[A-Z]/', '_$0', class_basename($model)));
    }

    private static function plain(mixed $value): mixed
    {
        return match (true) {
            $value instanceof BackedEnum => $value->value,
            $value instanceof CarbonInterface => $value->toDateString(),
            default => $value,
        };
    }
}
