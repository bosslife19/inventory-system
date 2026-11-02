<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupportMessageResource;
use App\Services\SupportChat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The signed-in account's support chat with the platform owner. Clients poll
 * GET /support/messages?after=<last id> every few seconds while it's open.
 */
class SupportController extends Controller
{
    /** Messages oldest first: the latest 100, or only those newer than `after`. */
    public function messages(Request $request, SupportChat $chat): JsonResponse
    {
        $filters = $request->validate([
            /** Last message id the client already has. */
            'after' => ['nullable', 'integer', 'min:0'],
        ]);
        $conversation = $chat->conversationOf($request->user());
        $messages = $conversation
            ? $conversation->messages()->with('sender:id,name')
                ->when(isset($filters['after']), fn ($q) => $q->where('id', '>', $filters['after']))
                ->latest('id')->limit(100)->get()->reverse()->values()
            : collect();

        return response()->json([
            'data' => SupportMessageResource::collection($messages),
            'meta' => [
                /**
                 * Null before the first message.
                 *
                 * @var 'open'|'closed'|null
                 */
                'status' => $conversation?->status,
                /**
                 * Replies from support not yet marked read.
                 *
                 * @var int
                 */
                'unread_count' => $conversation?->unreadForUser() ?? 0,
            ],
        ]);
    }

    /** Unread replies, for a badge (cheap enough to poll every minute). */
    public function unread(Request $request, SupportChat $chat): JsonResponse
    {
        return response()->json([
            'data' => [
                /** @var int */
                'unread_count' => $chat->conversationOf($request->user())?->unreadForUser() ?? 0,
            ],
        ]);
    }

    /** Send a message to support; starts or reopens the conversation. */
    public function store(Request $request, SupportChat $chat): SupportMessageResource
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:2000'],
        ]);

        return SupportMessageResource::make($chat->ask($request->user(), trim($data['body']))->load('sender:id,name'));
    }

    /** Mark every reply so far read. */
    public function read(Request $request, SupportChat $chat): Response
    {
        if ($conversation = $chat->conversationOf($request->user())) {
            $chat->markRead($conversation, support: false);
        }

        return response()->noContent();
    }
}
