<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Logos on the local disk under logos/, served by the API itself (no public
 * symlink needed on shared hosting). Each upload gets a new random file
 * name, so its URL can be cached for good and a replaced logo never shows
 * stale. SVG is refused: it can carry script.
 */
final class LogoStore
{
    public const RULES = ['required', 'file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:1024', 'dimensions:max_width=2000,max_height=2000'];

    /** @return string the stored path */
    public static function put(UploadedFile $file, string $prefix, ?string $replacing = null): string
    {
        $path = $file->storeAs('logos', $prefix.'-'.Str::random(16).'.'.$file->extension(), 'local');
        self::delete($replacing);

        return $path;
    }

    public static function delete(?string $path): void
    {
        if ($path) {
            Storage::disk('local')->delete($path);
        }
    }

    public static function response(?string $path, string $requested): Response
    {
        abort_if($path === null || basename($path) !== $requested || ! Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
