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

// Expiry status changes with the date, so re-check every facility each morning,
// after the reconcile window. Hourly retries resume a pass cut short by the time budget.
Schedule::command('stock:detect-alerts')
    ->hourly()
    ->between('05:00', '08:00')
    ->timezone(config('app.business_timezone'))
    ->withoutOverlapping();

// AMC snapshot for the new month, early on the 1st; hourly retries resume a
// pass cut short by the time budget and are no-ops once the month is done.
Schedule::command('stock:compute-amc')
    ->hourly()
    ->between('01:00', '05:00')
    ->when(fn () => now(config('app.business_timezone'))->day <= 2)
    ->timezone(config('app.business_timezone'))
    ->withoutOverlapping();
