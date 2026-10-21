<?php

namespace App\Http\Controllers\Api\V1\Owner;

use App\Http\Controllers\Controller;
use App\Http\Requests\SaveOrganizationRequest;
use App\Http\Resources\OrganizationResource;
use App\Http\Resources\UserResource;
use App\Models\Organization;
use App\Services\OrganizationService;
use App\Support\AuditLog;
use App\Support\LogoStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** The platform owner's console: every partner organization, its details, logo and plan. */
class OrganizationController extends Controller
{
    /** Every organization, newest first. */
    public function index(): AnonymousResourceCollection
    {
        return OrganizationResource::collection(
            Organization::query()
                ->withCount(['admins', 'users', 'facilities' => fn ($q) => $q->whereNull('store_level')])
                ->latest('id')
                ->get()
        );
    }

    public function show(Organization $organization): OrganizationResource
    {
        return OrganizationResource::make($organization);
    }

    /** Set up an organization: its stores are created, and its first admin when given (temporary password returned once). */
    public function store(SaveOrganizationRequest $request, OrganizationService $organizations): JsonResponse
    {
        [$organization, $admin, $password] = $organizations->create($request->validated(), $request->user());

        return response()->json([
            'data' => OrganizationResource::make($organization),
            /** @var array<string, mixed>|null */
            'admin' => $admin ? UserResource::make($admin) : null,
            /**
             * Give this to the admin with their email; they must change it at first sign-in. Not retrievable later.
             *
             * @var string|null
             */
            'temporary_password' => $password,
        ], 201);
    }

    /** Change details or plan (e.g. paid until a new date after a renewal), or suspend with is_active=false. */
    public function update(SaveOrganizationRequest $request, Organization $organization, OrganizationService $organizations): OrganizationResource
    {
        return OrganizationResource::make($organizations->update($organization, $request->validated(), $request->user()));
    }

    /** Upload or replace the logo (PNG, JPG or WebP, up to 1 MB), shown beside the platform's own. */
    public function uploadLogo(Request $request, Organization $organization): OrganizationResource
    {
        $request->validate(['logo' => LogoStore::RULES]);

        $organization->update(['logo_path' => LogoStore::put($request->file('logo'), "org-{$organization->id}", $organization->logo_path)]);
        AuditLog::record('organization.logo_changed', "Logo of {$organization->name} changed", $organization);

        return OrganizationResource::make($organization);
    }

    public function deleteLogo(Organization $organization): OrganizationResource
    {
        LogoStore::delete($organization->logo_path);
        $organization->update(['logo_path' => null]);
        AuditLog::record('organization.logo_changed', "Logo of {$organization->name} removed", $organization);

        return OrganizationResource::make($organization);
    }

    /**
     * An organization's logo image. Public, so it can sit in an img tag; the
     * file name changes with every upload.
     *
     * @unauthenticated
     */
    public function logo(Organization $organization, string $file)
    {
        return LogoStore::response($organization->logo_path, $file);
    }
}
