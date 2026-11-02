<?php

namespace App\Http\Resources;

use App\Models\SupportConversation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A conversation as the owner's support inbox lists it. @mixin SupportConversation */
class SupportConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** @var 'open'|'closed' */
            'status' => $this->status,
            'user' => [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'email' => $this->user->email,
                'role' => $this->user->role,
                /** @var list<string> */
                'place' => UserResource::make($this->user)->resolve($request)['node']['path'],
            ],
            'organization' => [
                'id' => $this->organization->id,
                'name' => $this->organization->name,
                /** @var 'free'|'paid' */
                'plan' => $this->organization->plan,
            ],
            'last_message_at' => $this->last_message_at,
            'last_message_preview' => $this->last_message_preview,
            'last_message_from_support' => $this->last_message_from_support,
            /** The account's messages the owner hasn't read yet. */
            'unread_count' => (int) ($this->unread_count ?? 0),
            'closed_at' => $this->closed_at,
        ];
    }
}
