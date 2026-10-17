<?php

namespace App\Console\Commands;

use App\Services\AlertDigest;
use Illuminate\Console\Command;

/**
 * The daily LGA / State / Federal digest of new alerts (AlertDigest). Safe to
 * re-run: each officer's digest only covers alerts since their previous one.
 */
class SendAlertDigests extends Command
{
    protected $signature = 'alerts:send-digests';

    protected $description = 'Send each LGA, State and Federal officer a digest of new stock alerts in their area';

    public function handle(AlertDigest $digest): int
    {
        $sent = $digest->sendAll();
        $this->info("Sent {$sent} ".($sent === 1 ? 'digest' : 'digests').'.');

        return self::SUCCESS;
    }
}
