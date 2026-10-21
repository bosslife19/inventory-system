<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Http\Controllers\Controller;
use App\Support\AuditLog;
use App\Support\LogoStore;
use App\Support\Platform;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The platform owner's own branding: shown on the sign-in screens and beside every organization's logo. */
class PlatformController extends Controller
{
    /**
     * The platform's name, tagline and logo. Public: the sign-in screens show it.
     *
     * @unauthenticated
     */
    public function show(): JsonResponse
    {
        return response()->json(['data' => Platform::branding()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'tagline' => ['nullable', 'string', 'max:120'],
        ]);

        Platform::put('name', $data['name']);
        Platform::put('tagline', $data['tagline'] ?? null);
        AuditLog::record('platform.updated', "Platform name set to {$data['name']}");

        return $this->show();
    }

    /** Upload or replace the platform logo (PNG, JPG or WebP, up to 1 MB). */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate(['logo' => LogoStore::RULES]);

        Platform::put('logo_path', LogoStore::put($request->file('logo'), 'platform', Platform::get('logo_path')));
        AuditLog::record('platform.logo_changed', 'Platform logo changed');

        return $this->show();
    }

    public function deleteLogo(): JsonResponse
    {
        LogoStore::delete(Platform::get('logo_path'));
        Platform::put('logo_path', null);

        return $this->show();
    }

    /**
     * The platform logo image.
     *
     * @unauthenticated
     */
    public function logo(string $file)
    {
        return LogoStore::response(Platform::get('logo_path'), $file);
    }
}
