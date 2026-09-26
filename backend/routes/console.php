<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Driven by a single cron entry on the host (docs/ARCHITECTURE.md, "Hosting constraints"):
 *   * * * * * php /path/to/artisan schedule:run
 */

// Hourly overnight so a pass that hits the time budget resumes; no-op once complete for the day.
Schedule::command('stock:reconcile')
    ->hourly()
    ->between('00:00', '05:00')
    ->timezone(config('app.business_timezone'))
    ->withoutOverlapping();
