<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\Organization;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Tenant;
use Illuminate\Support\Facades\DB;

/**
 * The platform owner's side: setting up a partner organization (with its
 * stores and first admin), changing its details or plan, suspending it.
 * Its admins then run everything inside it themselves.
 */
class OrganizationService
{
    public function __construct(private readonly UserAdminService $accounts) {}

    /**
     * @param  array<string, mixed>  $data  validated by SaveOrganizationRequest
     * @return array{Organization, User|null, string|null} the organization, its first admin and that admin's temporary password
     */
    public function create(array $data, User $owner): array
    {
        return DB::transaction(function () use ($data, $owner) {
            $organization = Organization::create(collect($data)->except('admin')->all());
            Facility::ensureStores($organization->id);
            AuditLog::record('organization.created', "Organization {$organization->name} set up on the {$organization->plan->value} plan", $organization, actor: $owner);

            [$admin, $password] = isset($data['admin'])
                ? $this->addAdmin($organization, $data['admin'], $owner)
                : [null, null];

            return [$organization, $admin, $password];
        });
    }

    /** @param  array<string, mixed>  $data  validated by SaveOrganizationRequest */
    public function update(Organization $organization, array $data, User $owner): Organization
    {
        return DB::transaction(function () use ($organization, $data, $owner) {
            $organization->update($data);
            if ($changes = AuditLog::diff($organization)) {
                AuditLog::record('organization.updated', "Organization {$organization->name} changed", $organization, changes: $changes, actor: $owner);
            }
            if ($organization->wasChanged('is_active') && ! $organization->is_active) {
                // Their tokens already stop working (EnsureAccountUsable); this also forgets their phones.
                DB::table('personal_access_tokens')->where('tokenable_type', User::class)
                    ->whereIn('tokenable_id', $organization->users()->select('id'))->delete();
                $organization->users()->update(['fcm_token' => null]);
            }

            return $organization;
        });
    }

    /**
     * @param  array{name: string, email: string}  $data
     * @return array{User, string} the admin and their temporary password, shown once
     */
    public function addAdmin(Organization $organization, array $data, User $owner): array
    {
        return Tenant::run($organization, fn () => $this->accounts->create(
            ['name' => $data['name'], 'email' => $data['email'], 'role' => UserRole::Admin->value], $owner,
        ));
    }
}
