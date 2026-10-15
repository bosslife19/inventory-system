<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditEventCollection;
use App\Http\Resources\AuditEventResource;
use App\Models\AuditEvent;
use App\Support\HierarchyScope;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The audit log: who did what, where and when, newest first — scoped like
 * everything else (HierarchyScope::scopeAuditEvents). Read-only; entries
 * are written by the actions themselves (App\Support\AuditLog).
 */
class AuditEventController extends Controller
{
    public function index(Request $request, HierarchyScope $scope): AuditEventCollection
    {
        $filters = $request->validate([
            'category' => ['nullable', Rule::in(array_unique(array_values(AuditEventResource::CATEGORIES)))],
            /** An exact action, e.g. user.deactivated. */
            'action' => ['nullable', 'string', 'max:50'],
            'actor_id' => ['nullable', 'integer'],
            'facility_id' => ['nullable', 'integer'],
            'lga_id' => ['nullable', 'integer'],
            'state_id' => ['nullable', 'integer'],
            /** Inclusive, YYYY-MM-DD (Africa/Lagos). */
            'from' => ['nullable', 'date_format:Y-m-d'],
            /** Inclusive, YYYY-MM-DD (Africa/Lagos). */
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            /** Words in the summary, e.g. a product code, a voucher or a person's name. */
            'q' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $tz = config('app.business_timezone');
        $prefixes = array_keys(array_filter(AuditEventResource::CATEGORIES, fn ($c) => $c === ($filters['category'] ?? null)));

        $events = $scope->scopeAuditEvents(AuditEvent::query())
            ->with(['actor', 'facility', 'lga', 'state'])
            ->when($prefixes, fn ($q) => $q->where(fn ($w) => array_map(fn ($p) => $w->orWhere('action', 'like', "{$p}.%"), $prefixes)))
            ->when($filters['action'] ?? null, fn ($q, $a) => $q->where('action', $a))
            ->when($filters['actor_id'] ?? null, fn ($q, $id) => $q->where('actor_id', $id))
            ->when($filters['facility_id'] ?? null, fn ($q, $id) => $q->where('facility_id', $id))
            ->when($filters['lga_id'] ?? null, fn ($q, $id) => $q->where('lga_id', $id))
            ->when($filters['state_id'] ?? null, fn ($q, $id) => $q->where('state_id', $id))
            ->when($filters['from'] ?? null, fn ($q, $d) => $q->where('occurred_at', '>=', CarbonImmutable::parse($d, $tz)->startOfDay()->utc()))
            ->when($filters['to'] ?? null, fn ($q, $d) => $q->where('occurred_at', '<', CarbonImmutable::parse($d, $tz)->addDay()->startOfDay()->utc()))
            ->when($filters['q'] ?? null, fn ($q, $term) => $q->where('summary', 'like', '%'.addcslashes($term, '%_\\').'%'))
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 50);

        return new AuditEventCollection($events);
    }
}
