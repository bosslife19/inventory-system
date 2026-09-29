<?php

namespace App\Services\Push;

use App\Contracts\PushSender;
use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging\AndroidConfig;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

/**
 * Firebase Cloud Messaging via the Admin SDK, called inline — a single HTTP
 * request per notification, cheap enough not to need a queue (backend
 * CLAUDE.md, shared-hosting constraints).
 */
class FcmPushSender implements PushSender
{
    private ?Messaging $messaging = null;

    public function __construct(private readonly string $credentialsPath) {}

    public function send(array $tokens, string $title, string $body, array $data = []): array
    {
        if ($tokens === []) {
            return [];
        }

        $message = CloudMessage::new()
            ->withNotification(Notification::create($title, $body))
            ->withData($data)
            // Same channel the app creates (mobile/src/lib/push.ts).
            ->withAndroidConfig(AndroidConfig::fromArray([
                'priority' => 'high',
                'notification' => ['channel_id' => 'stock-alerts', 'color' => '#1d4ed8'],
            ]));

        $report = $this->messaging()->sendMulticast($message, $tokens);

        return array_values(array_unique([...$report->invalidTokens(), ...$report->unknownTokens()]));
    }

    private function messaging(): Messaging
    {
        return $this->messaging ??= (new Factory)->withServiceAccount($this->credentialsPath)->createMessaging();
    }
}
