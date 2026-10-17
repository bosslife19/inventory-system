<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationCollection;
use App\Http\Resources\NotificationResource;
use App\Models\UserNotification;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** The signed-in user's own notifications: per-alert notices and officer digests. */
class NotificationController extends Controller
{
    /** Newest first. */
    public function index(Request $request): NotificationCollection
    {
        if ($request->has('unread')) {
            $request->merge(['unread' => filter_var($request->query('unread'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $request->query('unread')]);
        }
        $filters = $request->validate([
            /** true = unread only. */
            'unread' => ['nullable', 'boolean'],
            'type' => ['nullable', Rule::in([UserNotification::TYPE_ALERT, UserNotification::TYPE_DIGEST])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $mine = UserNotification::where('user_id', $request->user()->id);

        $page = (clone $mine)
            ->when($filters['unread'] ?? false, fn ($q) => $q->unread())
            ->when($filters['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 30);

        return new NotificationCollection($page, (clone $mine)->unread()->count());
    }

    /** Mark one read; already-read ones keep their first read time. */
    public function read(Request $request, UserNotification $notification): NotificationResource
    {
        abort_unless($notification->user_id === $request->user()->id, 404);
        $notification->read_at ??= CarbonImmutable::now();
        $notification->save();

        return NotificationResource::make($notification);
    }

    /** Mark all of the caller's notifications read. */
    public function readAll(Request $request): Response
    {
        UserNotification::where('user_id', $request->user()->id)->unread()->update(['read_at' => CarbonImmutable::now()]);

        return response()->noContent();
    }
}
