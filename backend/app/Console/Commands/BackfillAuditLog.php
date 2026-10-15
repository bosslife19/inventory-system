<?php

namespace App\Console\Commands;

use App\Models\DeliveryNote;
use App\Models\StockTransaction;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fills the audit log with what happened before it existed, from the records
 * that already say who did what: Stock Card entries (performed_by), delivery
 * notes (created / confirmed / rejected by) and accounts (created_by).
 * Idempotent: anything already logged is skipped, so it's safe to re-run.
 */
class BackfillAuditLog extends Command
{
    protected $signature = 'audit:backfill';

    protected $description = 'Write audit log entries for history recorded before the audit log existed';

    public function handle(): int
    {
        $counts = ['stock' => 0, 'deliveries' => 0, 'accounts' => 0];

        StockTransaction::query()
            ->whereNotExists(fn ($q) => $q->from('audit_events')->where('subject_type', 'stock_transaction')->whereColumn('subject_id', 'stock_transactions.id'))
            ->with(['facility.lga', 'product', 'batch', 'performer'])
            ->chunkById(500, function ($transactions) use (&$counts) {
                DB::transaction(function () use ($transactions, &$counts) {
                    foreach ($transactions as $t) {
                        AuditLog::record('stock.recorded', AuditLog::stockSummary($t, $t->product->sku, $t->batch?->batch_no),
                            $t, $t->facility, actor: $t->performer, at: $t->created_at);
                        $counts['stock']++;
                    }
                });
            });

        DeliveryNote::query()
            ->whereNotExists(fn ($q) => $q->from('audit_events')->where('subject_type', 'delivery_note')->whereColumn('subject_id', 'delivery_notes.id'))
            ->with(['facility.lga', 'sourceFacility.lga', 'creator', 'confirmer', 'rejecter', 'items'])
            ->chunkById(200, function ($notes) use (&$counts) {
                DB::transaction(function () use ($notes, &$counts) {
                    foreach ($notes as $note) {
                        $lines = $note->items->count();
                        $plural = $lines === 1 ? '' : 's';
                        if ($note->sourceFacility) {
                            AuditLog::record('dispatch.created', "Issued {$note->delivery_note_no} to {$note->facility->name} ({$lines} line{$plural}), awaiting their receipt",
                                $note, $note->sourceFacility, actor: $note->creator, at: $note->created_at);
                        } else {
                            AuditLog::record('delivery_note.created', "Delivery note {$note->delivery_note_no} from {$note->source} entered ({$lines} line{$plural})",
                                $note, $note->facility, actor: $note->creator, at: $note->created_at);
                        }
                        if ($note->confirmed_at) {
                            AuditLog::record('delivery_note.confirmed', "Delivery {$note->delivery_note_no} from {$note->source} confirmed as received on {$note->received_date->toDateString()}",
                                $note, $note->facility, actor: $note->confirmer, at: $note->confirmed_at);
                        }
                        if ($note->rejected_at) {
                            AuditLog::record('delivery_note.rejected', "Delivery {$note->delivery_note_no} from {$note->source} rejected".($note->rejection_reason ? ": {$note->rejection_reason}" : ''),
                                $note, $note->facility, actor: $note->rejecter, at: $note->rejected_at);
                        }
                        $counts['deliveries']++;
                    }
                });
            });

        User::query()
            ->whereNotNull('created_by')
            ->whereNotExists(fn ($q) => $q->from('audit_events')->where('subject_type', 'user')->where('action', 'user.created')->whereColumn('subject_id', 'users.id'))
            ->with(['facility.lga', 'lga', 'state'])
            ->each(function (User $user) use (&$counts) {
                AuditLog::record('user.created', "Account created for {$user->name} ({$user->email})", $user, AuditLog::placeOfUser($user),
                    actor: User::find($user->created_by), at: $user->created_at);
                $counts['accounts']++;
            });

        $this->info("Logged {$counts['stock']} Stock Card entries, {$counts['deliveries']} delivery notes, {$counts['accounts']} accounts.");

        return self::SUCCESS;
    }
}
