<?php

namespace App\Support;

use App\Models\Organization;
use Closure;

/**
 * The organization the current work is for. Set for the length of each
 * request by an organization's member (EnsureOrganizationMember); unset for
 * the platform owner, sign-in and the scheduled commands, which span every
 * organization and say which one they mean.
 *
 * While set, every organization-owned model (BelongsToOrganization) is
 * filtered to it and new rows join it — a second fence behind the
 * policies, so a forgotten filter can't show one partner another's data.
 */
final class Tenant
{
    private const KEY = 'tenant.organization_id';

    public static function id(): ?int
    {
        return app()->bound(self::KEY) ? app(self::KEY) : null;
    }

    /**
     * Run $work as $organization, then put back whatever was set before.
     *
     * @template T
     *
     * @param  Closure(): T  $work
     * @return T
     */
    public static function run(Organization|int|null $organization, Closure $work): mixed
    {
        $previous = self::id();
        self::set($organization);
        try {
            return $work();
        } finally {
            self::set($previous);
        }
    }

    public static function set(Organization|int|null $organization): void
    {
        app()->instance(self::KEY, $organization instanceof Organization ? $organization->id : $organization);
    }
}
