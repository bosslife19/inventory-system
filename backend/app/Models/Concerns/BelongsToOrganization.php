<?php

namespace App\Models\Concerns;

use App\Models\Organization;
use App\Support\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Rows owned by one organization (facilities, products, accounts, audit
 * events). While a Tenant is set, queries only see its rows — route model
 * binding included, so another organization's id is a 404 — and new rows
 * join it. Outside one (the owner, sign-in, scheduled commands) nothing is
 * filtered, and new rows must name their organization.
 */
trait BelongsToOrganization
{
    public const ORGANIZATION_SCOPE = 'organization';

    public static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope(self::ORGANIZATION_SCOPE, function (Builder $query) {
            if ($id = Tenant::id()) {
                $query->where($query->qualifyColumn('organization_id'), $id);
            }
        });

        static::creating(function (self $model) {
            // Rows allowed outside every organization (the owner) never join one by default.
            if (! $model->requiresOrganization()) {
                return;
            }
            $model->organization_id ??= Tenant::id()
                ?? throw new LogicException('A new '.class_basename($model).' must belong to an organization.');
        });
    }

    /** Rows that may exist outside every organization override this (the owner's account). */
    protected function requiresOrganization(): bool
    {
        return true;
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
