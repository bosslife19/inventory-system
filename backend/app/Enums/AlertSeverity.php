<?php

namespace App\Enums;

enum AlertSeverity: string
{
    case Info = 'info';
    case Warning = 'warning';
    case Critical = 'critical';

    /** Most severe first, for ORDER BY. */
    public static function sortSql(string $column = 'severity'): string
    {
        return "case {$column} when 'critical' then 0 when 'warning' then 1 else 2 end";
    }
}
