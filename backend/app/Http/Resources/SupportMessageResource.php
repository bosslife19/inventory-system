<?php

namespace App\Http\Resources;

use App\Models\SupportMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SupportMessage */
class SupportMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** True for the platform owner's replies, false for the account's own messages. */
            'from_support' => $this->from_support,
            /** Who wrote it; null if that account was deleted. */
            'sender_name' => $this->sender?->name,
            'body' => $this->body,
            'created_at' => $this->created_at,
        ];
    }
}
