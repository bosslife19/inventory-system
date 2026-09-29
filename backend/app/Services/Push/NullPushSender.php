<?php

namespace App\Services\Push;

use App\Contracts\PushSender;

/** Used when no Firebase credentials are configured (local dev, tests): push is simply off. */
class NullPushSender implements PushSender
{
    public function send(array $tokens, string $title, string $body, array $data = []): array
    {
        return [];
    }
}
