<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The platform owner's own branding, shown beside each organization's logo
 * and on the sign-in screens: a name, a tagline and a logo (platform_settings).
 */
final class Platform
{
    public const DEFAULT_NAME = 'Stock Card';

    public const DEFAULT_TAGLINE = 'Health supply chain · Nigeria';

    public static function get(string $key): ?string
    {
        return DB::table('platform_settings')->where('key', $key)->value('value');
    }

    public static function put(string $key, ?string $value): void
    {
        DB::table('platform_settings')->updateOrInsert(['key' => $key], ['value' => $value]);
    }

    /** @return array{name: string, tagline: string, logo_url: string|null} */
    public static function branding(): array
    {
        $settings = DB::table('platform_settings')->pluck('value', 'key');
        $logo = $settings['logo_path'] ?? null;

        return [
            'name' => $settings['name'] ?? self::DEFAULT_NAME,
            'tagline' => $settings['tagline'] ?? self::DEFAULT_TAGLINE,
            'logo_url' => $logo ? url('/api/v1/platform/logo/'.basename($logo)) : null,
        ];
    }
}
