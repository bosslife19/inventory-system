<?php

return [

    /*
    | A batch with stock on hand is "expiring soon" when its expiry date is
    | within this many days (and not already past).
    */

    'expiring_soon_days' => (int) env('INVENTORY_EXPIRING_SOON_DAYS', 90),

    /*
    | Average Monthly Consumption is averaged over this many complete months
    | before the current one (issues only).
    */

    'amc_months' => (int) env('INVENTORY_AMC_MONTHS', 3),

    /*
    | Quantity to order tops usable stock up to AMC x this many months (the
    | Excel "Max SL" in months). Products with no consumption history yet
    | fall back to their fixed max_stock_level.
    */

    'max_months_of_stock' => (float) env('INVENTORY_MAX_MONTHS_OF_STOCK', 3),

];
