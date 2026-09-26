<?php

return [

    /*
    | A batch with stock on hand is "expiring soon" when its expiry date is
    | within this many days (and not already past).
    */

    'expiring_soon_days' => (int) env('INVENTORY_EXPIRING_SOON_DAYS', 90),

];
