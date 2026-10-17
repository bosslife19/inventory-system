<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;

/** Paginated notifications in the {data, meta: {pagination, unread_count}} shape. */
class NotificationCollection extends ResourceCollection
{
    public $collects = NotificationResource::class;

    public function __construct($resource, private readonly int $unreadCount = 0)
    {
        parent::__construct($resource);
    }

    /** @return array{meta: array{pagination: array{current_page: int, per_page: int, total: int, last_page: int}, unread_count: int}} */
    public function paginationInformation(Request $request, array $paginated, array $default): array
    {
        return [
            'meta' => [
                'pagination' => [
                    'current_page' => $paginated['current_page'],
                    'per_page' => $paginated['per_page'],
                    'total' => $paginated['total'],
                    'last_page' => $paginated['last_page'],
                ],
                /** All of the caller's unread notifications, whatever the filters. */
                'unread_count' => $this->unreadCount,
            ],
        ];
    }
}
