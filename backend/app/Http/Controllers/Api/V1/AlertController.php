<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AlertSeverity;
use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Http\Controllers\Controller;
use App\Http\Resources\AlertCollection;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Models\Facility;
use App\Support\HierarchyScope;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AlertController extends Controller
{
    private const RELATIONS = ['facility', 'product', 'batch', 'acknowledger', 'resolver'];

    /**
     * Alerts for every facility in the caller's scope, most severe first.
     * Without a status filter, returns alerts still needing attention
     * (open and acknowledged).
     */
    public function index(Request $request, HierarchyScope $scope): AlertCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', Rule::enum(AlertStatus::class)],
            'alert_type' => ['nullable', Rule::enum(AlertType::class)],
            'severity' => ['nullable', Rule::enum(AlertSeverity::class)],
            /** Narrow to one facility within your scope. */
            'facility_id' => ['nullable', 'integer'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $alerts = Alert::query()
            ->whereIn('facility_id', $scope->scopeFacilities(Facility::query())->select('id'))
            ->with(self::RELATIONS)
            ->when(
                $filters['status'] ?? null,
                fn ($q, $status) => $q->where('status', $status),
                fn ($q) => $q->whereIn('status', [AlertStatus::Open, AlertStatus::Acknowledged]),
            )
            ->when($filters['alert_type'] ?? null, fn ($q, $type) => $q->where('alert_type', $type))
            ->when($filters['severity'] ?? null, fn ($q, $severity) => $q->where('severity', $severity))
            ->when($filters['facility_id'] ?? null, fn ($q, $id) => $q->where('facility_id', $id))
            ->orderByRaw(AlertSeverity::sortSql())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 50);

        return new AlertCollection($alerts);
    }

    /** Mark an open alert as seen and being handled. No-op if already acknowledged. */
    public function acknowledge(Request $request, Alert $alert): AlertResource
    {
        Gate::authorize('update', $alert);

        if ($alert->status === AlertStatus::Resolved) {
            throw ValidationException::withMessages(['status' => 'This alert is already resolved.']);
        }

        if ($alert->status === AlertStatus::Open) {
            $alert->update([
                'status' => AlertStatus::Acknowledged,
                'acknowledged_at' => CarbonImmutable::now(),
                'acknowledged_by' => $request->user()->id,
            ]);
        }

        return AlertResource::make($alert->load(self::RELATIONS));
    }

    /**
     * Close an alert. If the stock situation still holds, it is not raised
     * again until it clears and recurs. No-op if already resolved.
     */
    public function resolve(Request $request, Alert $alert): AlertResource
    {
        Gate::authorize('update', $alert);

        if ($alert->status !== AlertStatus::Resolved) {
            $alert->update([
                'status' => AlertStatus::Resolved,
                'resolved_at' => CarbonImmutable::now(),
                'resolved_by' => $request->user()->id,
            ]);
        }

        return AlertResource::make($alert->load(self::RELATIONS));
    }
}
