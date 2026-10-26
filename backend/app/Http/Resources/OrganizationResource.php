<?php

namespace App\Http\Resources;

use App\Enums\Feature;
use App\Enums\UserRole;
use App\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An organization as the platform owner sees it (GET /owner/organizations):
 * everything, including the owner's private notes.
 *
 * @mixin Organization
 */
class OrganizationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'logo_url' => $this->logoUrl(),
            'contact_name' => $this->contact_name,
            'contact_email' => $this->contact_email,
            'contact_phone' => $this->contact_phone,
            'address' => $this->address,
            /** The plan as set; see effective_plan for what applies today. */
            'plan' => $this->plan,
            /** The paid tier (limits); null = no limits on the paid plan. */
            'plan_tier_id' => $this->plan_tier_id,
            /** @var array{id: int, name: string, max_facilities: int|null, max_accounts: int|null}|null */
            'plan_tier' => $this->tier ? [
                'id' => $this->tier->id, 'name' => $this->tier->name, 'max_facilities' => $this->tier->max_facilities, 'max_accounts' => $this->tier->max_accounts,
            ] : null,
            /** Last day of the paid plan (Y-m-d); null = no end date. */
            'paid_until' => $this->paid_until?->toDateString(),
            /** "free" once a paid plan has passed its last day. */
            'effective_plan' => $this->effectivePlan(),
            /** Days left on a paid plan with an end date, today included; null otherwise. */
            'days_left' => $this->daysLeft(),
            /** @var list<string> */
            'features' => array_map(fn (Feature $f) => $f->value, $this->features()),
            'is_active' => $this->is_active,
            'notes' => $this->notes,
            /** @var int */
            'admin_count' => $this->whenCounted('admins', fn () => (int) $this->admins_count, fn () => $this->users()->where('role', UserRole::Admin)->count()),
            /** @var int */
            'user_count' => $this->whenCounted('users', fn () => (int) $this->users_count, fn () => $this->users()->count()),
            /** Service delivery points (stores not counted). @var int */
            'facility_count' => $this->whenCounted('facilities', fn () => (int) $this->facilities_count, fn () => $this->facilities()->whereNull('store_level')->count()),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
