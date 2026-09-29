<?php

namespace App\Contracts;

/** Sends one push notification to several devices. */
interface PushSender
{
    /**
     * @param  list<string>  $tokens  FCM registration tokens
     * @param  array<string, string>  $data  delivered to the app with the notification
     * @return list<string> tokens that are no longer valid and should be forgotten
     */
    public function send(array $tokens, string $title, string $body, array $data = []): array;
}
