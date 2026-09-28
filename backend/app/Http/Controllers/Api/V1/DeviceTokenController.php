<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class DeviceTokenController extends Controller
{
    /**
     * Register (or clear, with null) the push token of the device the user is
     * signed in on. Tokens rotate, so the app sends it on every sign-in and
     * foreground (mobile/CLAUDE.md rule 4).
     */
    public function store(Request $request): Response
    {
        $validated = $request->validate([
            /** FCM registration token; null to stop pushes to this user (e.g. on sign-out). */
            'token' => ['present', 'nullable', 'string', 'max:4096'],
        ]);

        $request->user()->forceFill(['fcm_token' => $validated['token']])->save();

        return response()->noContent();
    }
}
