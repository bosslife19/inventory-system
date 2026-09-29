<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;

/** Paginated delivery notes in the contract's {data, meta: {pagination}} shape. */
class DeliveryNoteCollection extends ResourceCollection
{
    public $collects = DeliveryNoteResource::class;

    /** @return array{meta: array{pagination: array{current_page: int, per_page: int, total: int, last_page: int}}} */
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
            ],
        ];
    }
}
