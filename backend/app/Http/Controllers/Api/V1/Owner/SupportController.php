<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupportConversationResource;
use App\Http\Resources\SupportMessageResource;
use App\Models\SupportConversation;
use App\Services\SupportChat;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** The owner's support inbox: every organization's conversations. */
class SupportController extends Controller
{
    /** Conversations, newest message first; filter by status, and by name, email or organization. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', Rule::in([SupportConversation::OPEN, SupportConversation::CLOSED])],
            'q' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $page = $this->withUnread(SupportConversation::query())
            ->with(['user', 'organization'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';
                $q->where(fn ($w) => $w
                    ->whereHas('user', fn ($u) => $u->where('name', 'like', $like)->orWhere('email', 'like', $like))
                    ->orWhereHas('organization', fn ($o) => $o->where('name', 'like', $like)));
            })
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 30);

        return SupportConversationResource::collection($page);
    }

    /** How many conversations have messages the owner hasn't read, for the console's badge. */
    public function unread(): JsonResponse
    {
        $count = SupportConversation::query()
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('support_messages')
                ->whereColumn('support_messages.support_conversation_id', 'support_conversations.id')
                ->where('support_messages.from_support', false)
                ->whereColumn('support_messages.id', '>', 'support_conversations.support_read_message_id'))
            ->count();

        return response()->json([
            'data' => [
                /** @var int */
                'unread_conversations' => $count,
            ],
        ]);
    }

    public function show(SupportConversation $conversation): SupportConversationResource
    {
        return SupportConversationResource::make(
            $this->withUnread(SupportConversation::query())->with(['user', 'organization'])->findOrFail($conversation->id)
        );
    }

    /** Messages oldest first: the latest 200, or only those newer than `after`. */
    public function messages(Request $request, SupportConversation $conversation): AnonymousResourceCollection
    {
        $filters = $request->validate([
            /** Last message id the client already has. */
            'after' => ['nullable', 'integer', 'min:0'],
        ]);

        return SupportMessageResource::collection(
            $conversation->messages()->with('sender:id,name')
                ->when(isset($filters['after']), fn ($q) => $q->where('id', '>', $filters['after']))
                ->latest('id')->limit(200)->get()->reverse()->values()
        );
    }

    /** Reply; the account gets a push on their phone if one is registered. */
    public function reply(Request $request, SupportConversation $conversation, SupportChat $chat): SupportMessageResource
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        return SupportMessageResource::make($chat->reply($conversation, $request->user(), trim($data['body']))->load('sender:id,name'));
    }

    /** Mark the account's messages so far read. */
    public function read(SupportConversation $conversation, SupportChat $chat): Response
    {
        $chat->markRead($conversation, support: true);

        return response()->noContent();
    }

    /** Close a conversation that's been dealt with, or reopen it. The account writing again reopens it too. */
    public function update(Request $request, SupportConversation $conversation): SupportConversationResource
    {
        $data = $request->validate(['status' => ['required', Rule::in([SupportConversation::OPEN, SupportConversation::CLOSED])]]);
        $conversation->update([
            'status' => $data['status'],
            'closed_at' => $data['status'] === SupportConversation::CLOSED ? CarbonImmutable::now() : null,
        ]);

        return $this->show($conversation);
    }

    /**
     * @param  Builder<SupportConversation>  $query
     * @return Builder<SupportConversation>
     */
    private function withUnread(Builder $query): Builder
    {
        return $query->withCount(['messages as unread_count' => fn ($q) => $q
            ->where('from_support', false)
            ->whereColumn('support_messages.id', '>', 'support_conversations.support_read_message_id')]);
    }
}
