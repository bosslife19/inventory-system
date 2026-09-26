<?php

namespace App\Data;

use App\Enums\ExpiryStatus;
use App\Models\Batch;

/** One stock_balances row. $batch is null for non-batch-tracked products. */
final readonly class BatchStock
{
    public function __construct(
        public ?Batch $batch,
        public int $quantityOnHand,
        public ?ExpiryStatus $expiryStatus,
        public int $lastTransactionId,
    ) {}
}
