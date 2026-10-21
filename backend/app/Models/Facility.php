<?php

namespace App\Models;

use App\Enums\StoreLevel;
use App\Models\Concerns\BelongsToOrganization;
use App\Support\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * A place that keeps a Stock Card: an SDP (store_level null, always in an
 * LGA), or the one store of an LGA, a state or the nation (store_level set).
 * State stores carry state_id instead of lga_id; the national store neither.
 * Each organization has its own stores, one per LGA, state and the nation.
 */
class Facility extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'lga_id', 'state_id', 'name', 'type', 'store_level', 'store_key', 'address', 'latitude', 'longitude', 'phone', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'is_active' => 'boolean',
            'store_level' => StoreLevel::class,
        ];
    }

    public function lga(): BelongsTo
    {
        return $this->belongsTo(Lga::class);
    }

    /** Only set on state stores; use stateId() for any facility's state. */
    public function state(): BelongsTo
    {
        return $this->belongsTo(State::class);
    }

    public function stockTransactions(): HasMany
    {
        return $this->hasMany(StockTransaction::class);
    }

    public function stockBalances(): HasMany
    {
        return $this->hasMany(StockBalance::class);
    }

    public function isStore(): bool
    {
        return $this->store_level !== null;
    }

    /** The state this facility sits in; null only for the national store. */
    public function stateId(): ?int
    {
        return $this->state_id ?? $this->lga?->state_id;
    }

    /** SDPs only — what the rollups count. Stores keep their own Stock Card outside them. */
    public function scopeServicePoints(Builder $query): Builder
    {
        return $query->whereNull('facilities.store_level');
    }

    /**
     * For the scheduled passes: every SDP, plus the stores that have started
     * a Stock Card — most of the ~800 stores may never record anything.
     */
    public function scopeWithLedger(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('facilities.store_level')
            ->orWhereExists(fn ($e) => $e->from('stock_transactions')->whereColumn('stock_transactions.facility_id', 'facilities.id')));
    }

    /** The stores below belong to $organizationId, else to the current Tenant. */
    public static function nationalStore(?int $organizationId = null): self
    {
        return self::store($organizationId, 'national', [
            'name' => 'National Store', 'type' => 'warehouse', 'store_level' => StoreLevel::National,
        ]);
    }

    public static function storeForState(State $state, ?int $organizationId = null): self
    {
        return self::store($organizationId, "state:{$state->id}", [
            'state_id' => $state->id, 'name' => "{$state->name} State Store", 'type' => 'warehouse', 'store_level' => StoreLevel::State,
        ]);
    }

    public static function storeForLga(Lga $lga, ?int $organizationId = null): self
    {
        return self::store($organizationId, "lga:{$lga->id}", [
            'lga_id' => $lga->id, 'name' => "{$lga->name} LGA Store", 'type' => 'warehouse', 'store_level' => StoreLevel::Lga,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private static function store(?int $organizationId, string $key, array $attributes): self
    {
        $organizationId ??= Tenant::id() ?? throw new LogicException('Say which organization the store belongs to.');

        return self::withoutGlobalScope(self::ORGANIZATION_SCOPE)
            ->firstOrCreate(['organization_id' => $organizationId, 'store_key' => $key], $attributes);
    }

    /** Create any missing stores of an organization in bulk (a new organization, a newly loaded hierarchy). Idempotent. */
    public static function ensureStores(int $organizationId): void
    {
        self::nationalStore($organizationId);
        $now = now();
        $stores = fn (StoreLevel $level) => self::withoutGlobalScope(self::ORGANIZATION_SCOPE)
            ->where('organization_id', $organizationId)->where('store_level', $level);

        DB::table('facilities')->insertOrIgnore(DB::table('states')
            ->whereNotIn('id', $stores(StoreLevel::State)->select('state_id'))
            ->get(['id', 'name'])
            ->map(fn ($state) => [
                'organization_id' => $organizationId, 'state_id' => $state->id, 'name' => "{$state->name} State Store", 'type' => 'warehouse',
                'store_level' => StoreLevel::State->value, 'store_key' => "state:{$state->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ])->all());

        DB::table('lgas')
            ->whereNotIn('id', $stores(StoreLevel::Lga)->select('lga_id'))
            ->get(['id', 'name'])
            ->chunk(500)
            ->each(fn ($chunk) => DB::table('facilities')->insertOrIgnore($chunk->map(fn ($lga) => [
                'organization_id' => $organizationId, 'lga_id' => $lga->id, 'name' => "{$lga->name} LGA Store", 'type' => 'warehouse',
                'store_level' => StoreLevel::Lga->value, 'store_key' => "lga:{$lga->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ])->all()));
    }
}
