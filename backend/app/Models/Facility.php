<?php

namespace App\Models;

use App\Enums\StoreLevel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A place that keeps a Stock Card: an SDP (store_level null, always in an
 * LGA), or the one store of an LGA, a state or the nation (store_level set).
 * State stores carry state_id instead of lga_id; the national store neither.
 */
class Facility extends Model
{
    protected $fillable = [
        'lga_id', 'state_id', 'name', 'type', 'store_level', 'store_key', 'address', 'latitude', 'longitude', 'phone', 'is_active',
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

    public static function nationalStore(): self
    {
        return self::firstOrCreate(['store_key' => 'national'], [
            'name' => 'National Store', 'type' => 'warehouse', 'store_level' => StoreLevel::National,
        ]);
    }

    public static function storeForState(State $state): self
    {
        return self::firstOrCreate(['store_key' => "state:{$state->id}"], [
            'state_id' => $state->id, 'name' => "{$state->name} State Store", 'type' => 'warehouse', 'store_level' => StoreLevel::State,
        ]);
    }

    public static function storeForLga(Lga $lga): self
    {
        return self::firstOrCreate(['store_key' => "lga:{$lga->id}"], [
            'lga_id' => $lga->id, 'name' => "{$lga->name} LGA Store", 'type' => 'warehouse', 'store_level' => StoreLevel::Lga,
        ]);
    }

    /** Create any missing stores in bulk (seeding, a newly loaded hierarchy). Idempotent. */
    public static function ensureStores(): void
    {
        self::nationalStore();
        $now = now();

        DB::table('facilities')->insertOrIgnore(DB::table('states')
            ->whereNotIn('id', self::query()->where('store_level', StoreLevel::State)->select('state_id'))
            ->get(['id', 'name'])
            ->map(fn ($state) => [
                'state_id' => $state->id, 'name' => "{$state->name} State Store", 'type' => 'warehouse',
                'store_level' => StoreLevel::State->value, 'store_key' => "state:{$state->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ])->all());

        DB::table('lgas')
            ->whereNotIn('id', self::query()->where('store_level', StoreLevel::Lga)->select('lga_id'))
            ->get(['id', 'name'])
            ->chunk(500)
            ->each(fn ($chunk) => DB::table('facilities')->insertOrIgnore($chunk->map(fn ($lga) => [
                'lga_id' => $lga->id, 'name' => "{$lga->name} LGA Store", 'type' => 'warehouse',
                'store_level' => StoreLevel::Lga->value, 'store_key' => "lga:{$lga->id}",
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ])->all()));
    }
}
