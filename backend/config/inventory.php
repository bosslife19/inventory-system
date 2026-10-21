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
    | Stock levels in months of AMC, used wherever a product has an AMC (the
    | computed one, or the facility's entered starting AMC):
    |   max = 3 months to the next quarterly resupply + 2 months of buffer;
    |   min = the 2 months of buffer stock (below it: time to order);
    |   EOP = 1 month (at or below it: the low-stock alert, emergency order).
    | Quantity to order tops usable stock up to the max. Products with no
    | AMC yet fall back to their fixed levels (the facility's own, else the
    | catalog's).
    */

    'max_months_of_stock' => (float) env('INVENTORY_MAX_MONTHS_OF_STOCK', 5),

    'min_months_of_stock' => (float) env('INVENTORY_MIN_MONTHS_OF_STOCK', 2),

    'eop_months_of_stock' => (float) env('INVENTORY_EOP_MONTHS_OF_STOCK', 1),

];
