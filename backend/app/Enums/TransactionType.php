<?php

namespace App\Enums;

/**
 * Stock Card row types. quantity is always >= 0; the direction comes from
 * the type. This is the single definition of how each type moves a balance —
 * StockLedgerService and ReconcileStockBalances both go through apply().
 */
enum TransactionType: string
{
    case Receipt = 'receipt';
    case Issue = 'issue';
    case Loss = 'loss';
    case AdjustmentIn = 'adjustment_in';
    case AdjustmentOut = 'adjustment_out';
    case PhysicalCount = 'physical_count';
    case TransferIn = 'transfer_in';
    case TransferOut = 'transfer_out';

    public function isInbound(): bool
    {
        return in_array($this, [self::Receipt, self::TransferIn, self::AdjustmentIn], true);
    }

    public function isOutbound(): bool
    {
        return in_array($this, [self::Issue, self::Loss, self::TransferOut, self::AdjustmentOut], true);
    }

    /** New balance after this transaction; physical_count replaces rather than adds. */
    public function apply(int $current, int $quantity): int
    {
        return match (true) {
            $this === self::PhysicalCount => $quantity,
            $this->isInbound() => $current + $quantity,
            default => $current - $quantity,
        };
    }

    /** Types that can introduce a batch the system hasn't seen before. */
    public function canCreateBatch(): bool
    {
        return $this->isInbound() || $this === self::PhysicalCount;
    }

    /** "Received From / Issued To" is meaningful only when stock moves to/from someone. */
    public function requiresCounterparty(): bool
    {
        return in_array($this, [self::Receipt, self::Issue, self::TransferIn, self::TransferOut], true);
    }
}
