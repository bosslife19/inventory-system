<?php

namespace Database\Seeders;

use App\Enums\TransactionType;
use App\Models\Facility;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\User;
use App\Services\StockLedgerService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/**
 * Small, deterministic demo dataset in Kaduna State: 4 facilities across
 * 2 LGAs, 6 products, one user per role, and ~90 days of Stock Card history.
 *
 * Facilities are tuned so the dashboards have something to show:
 *   - Kawo PHC:         healthy, plus a loss, an adjustment and a physical count
 *   - Unguwan Rimi PHC: AL low stock, ORS stock-out
 *   - Kaduna North GH:  several products below reorder level
 *   - Tudun Wada PHC:   slow consumption, expired AL and expiring oxytocin on hand
 *
 * Every ledger entry goes through StockLedgerService::record(), exactly as
 * the API does. The seeder only decides *what* to record: issues without
 * an explicit batch are split FEFO across unexpired batches, and outflows
 * are capped at what's on hand (which is how the stock-out scenario arises).
 *
 * All users have password "password". Requires NigeriaStatesLgasSeeder.
 */
class DemoDataSeeder extends Seeder
{
    private const PRODUCTS = [
        // sku => [name, category, unit, batch tracked, cold chain, min, max, reorder]
        'AL-20-120' => ['Artemether/Lumefantrine 20/120mg tablets (6x4)', 'Antimalarials', 'pack', true, false, 20, 60, 30],
        'AMX-250' => ['Amoxicillin 250mg dispersible tablets (10)', 'Antibiotics', 'pack', true, false, 30, 90, 45],
        'ORS-LO' => ['Oral Rehydration Salts, low osmolarity', 'Diarrhoea management', 'sachet', true, false, 100, 300, 150],
        'ZNC-20' => ['Zinc sulphate 20mg dispersible tablets (10)', 'Diarrhoea management', 'pack', true, false, 40, 120, 60],
        'OXY-10IU' => ['Oxytocin 10 IU/ml injection', 'Maternal health', 'ampoule', true, true, 20, 60, 30],
        'GLV-EXM-M' => ['Examination gloves, medium (100)', 'Consumables', 'box', false, false, 5, 20, 8],
    ];

    // sku => [batch A (older), batch B (newer)] as [batch_no, expiry in days from today]
    private const BATCHES = [
        'AL-20-120' => [['AL2401A', -10], ['AL2503C', 300]],
        'AMX-250' => [['AMX24117', 200], ['AMX25042', 500]],
        'ORS-LO' => [['ORS2409', 365], ['ORS2511', 700]],
        'ZNC-20' => [['ZN24-088', 150], ['ZN25-013', 450]],
        'OXY-10IU' => [['OXY2406B', 45], ['OXY2512A', 400]],
    ];

    private const RECEIPT_SOURCE = 'Kaduna State Central Medical Stores';

    /** @var array<string, int> */
    private array $productIds = [];

    /** @var array<string, array{id:int, expiry:Carbon}> keyed "sku|batch_no" */
    private array $batches = [];

    public function run(): void
    {
        if (DB::table('facilities')->where('name', 'Kawo Primary Health Centre')->exists()) {
            $this->command?->warn('Demo data already present, skipping.');

            return;
        }

        DB::transaction(function () {
            $state = DB::table('states')->where('name', 'Kaduna')->first()
                ?? throw new RuntimeException('Run NigeriaStatesLgasSeeder first.');
            $kadunaNorth = $this->lgaId($state->id, 'Kaduna North');
            $zaria = $this->lgaId($state->id, 'Zaria');

            $this->seedProducts();

            $facilities = [
                // name, lga, type, lat, lng, default issue rate, per-sku rate overrides, extra events
                ['Kawo Primary Health Centre', $kadunaNorth, 'health_center', 10.5920, 7.4460, 1.0, [], $this->kawoExtras()],
                ['Unguwan Rimi Primary Health Centre', $kadunaNorth, 'health_center', 10.5530, 7.4450, 1.0, ['AL-20-120' => 1.45, 'ORS-LO' => 1.8], []],
                ['Kaduna North General Hospital Pharmacy', $kadunaNorth, 'hospital', 10.5410, 7.4390, 1.2, [], []],
                ['Tudun Wada Primary Health Centre, Zaria', $zaria, 'health_center', 11.0680, 7.7010, 0.8, [], []],
            ];

            $this->seedUsers($state->id, $kadunaNorth);

            foreach ($facilities as $i => [$name, $lgaId, $type, $lat, $lng, $rate, $overrides, $extras]) {
                $facilityId = DB::table('facilities')->insertGetId([
                    'lga_id' => $lgaId,
                    'name' => $name,
                    'type' => $type,
                    'address' => $name.', Kaduna State',
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'phone' => sprintf('+23480300000%02d', $i + 1),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $staffId = DB::table('users')->insertGetId([
                    'name' => 'SDP Staff '.($i + 1),
                    'email' => sprintf('sdp%d@demo.test', $i + 1),
                    'password' => Hash::make('password'),
                    'role' => 'sdp_staff',
                    'facility_id' => $facilityId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $events = array_merge($this->standardEvents($rate, $overrides), $extras);
                $this->replayLedger(Facility::findOrFail($facilityId), User::findOrFail($staffId), $events);
            }
        });

        $this->command?->info(sprintf(
            'Demo data: %d facilities, %d products, %d batches, %d users, %d transactions, %d balances.',
            DB::table('facilities')->count(),
            DB::table('products')->count(),
            DB::table('batches')->count(),
            DB::table('users')->count(),
            DB::table('stock_transactions')->count(),
            DB::table('stock_balances')->count(),
        ));
    }

    private function lgaId(int $stateId, string $name): int
    {
        return DB::table('lgas')->where(['state_id' => $stateId, 'name' => $name])->value('id')
            ?? throw new RuntimeException("LGA {$name} not found.");
    }

    private function seedProducts(): void
    {
        foreach (self::PRODUCTS as $sku => [$name, $category, $unit, $batched, $cold, $min, $max, $reorder]) {
            $this->productIds[$sku] = DB::table('products')->insertGetId([
                'name' => $name,
                'sku' => $sku,
                'category' => $category,
                'unit_of_measure' => $unit,
                'requires_batch_tracking' => $batched,
                'requires_cold_chain' => $cold,
                'min_stock_level' => $min,
                'max_stock_level' => $max,
                'reorder_level' => $reorder,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach (self::BATCHES as $sku => $batches) {
            foreach ($batches as [$batchNo, $expiresInDays]) {
                $expiry = today()->addDays($expiresInDays);
                $this->batches["{$sku}|{$batchNo}"] = [
                    'id' => DB::table('batches')->insertGetId([
                        'product_id' => $this->productIds[$sku],
                        'batch_no' => $batchNo,
                        'manufacture_date' => $expiry->copy()->subYears(2)->toDateString(),
                        'expiry_date' => $expiry->toDateString(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]),
                    'expiry' => $expiry,
                ];
            }
        }
    }

    private function seedUsers(int $stateId, int $lgaId): void
    {
        $users = [
            ['Demo Admin', 'admin@demo.test', 'admin', []],
            ['Federal Officer', 'federal@demo.test', 'federal_officer', []],
            ['Kaduna State Officer', 'state@demo.test', 'state_officer', ['state_id' => $stateId]],
            ['Kaduna North LGA Officer', 'lga@demo.test', 'lga_officer', ['lga_id' => $lgaId]],
        ];

        foreach ($users as [$name, $email, $role, $scope]) {
            DB::table('users')->insert([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make('password'),
                'role' => $role,
                'created_at' => now(),
                'updated_at' => now(),
                ...$scope,
            ]);
        }
    }

    /**
     * Receipt of batch A 88 days ago, weekly issues, receipt of batch B 42
     * days ago. At rate 1.0 a product ends ~60% of max; ~1.45 goes below
     * min; ~1.8 stocks out.
     *
     * Event shape: [days_ago, sku, type, qty, counterparty, batch_no|null, voucher|null]
     */
    private function standardEvents(float $defaultRate, array $overrides): array
    {
        $events = [];

        foreach (self::PRODUCTS as $sku => $p) {
            $max = $p[6];
            $rate = $overrides[$sku] ?? $defaultRate;
            [$batchA, $batchB] = self::BATCHES[$sku] ?? [[null], [null]];

            $events[] = [88, $sku, 'receipt', $max, self::RECEIPT_SOURCE, $batchA[0], 'SRV-'.$sku.'-01'];
            $events[] = [42, $sku, 'receipt', (int) round($max * 0.6), self::RECEIPT_SOURCE, $batchB[0], 'SRV-'.$sku.'-02'];

            for ($daysAgo = 84; $daysAgo >= 7; $daysAgo -= 7) {
                $events[] = [$daysAgo, $sku, 'issue', max(1, (int) round($max / 12 * $rate)), 'OPD Dispensary', null, null];
            }
        }

        return $events;
    }

    private function kawoExtras(): array
    {
        return [
            [20, 'AMX-250', 'loss', 3, 'Store', 'AMX25042', null, 'Water damage from roof leak'],
            [15, 'ORS-LO', 'adjustment_in', 10, 'Store', 'ORS2511', null, 'Carton found during shelf reorganisation'],
            [5, 'AL-20-120', 'physical_count', -2, 'Store', 'AL2503C', null, 'Monthly count; 2 packs unaccounted for'],
            [3, 'GLV-EXM-M', 'issue', 2, 'Labour Ward', null, 'SIV-0042', null],
        ];
    }

    /**
     * Records events oldest-first through StockLedgerService. For
     * physical_count, qty is the variance against the batch's current balance
     * (the counted quantity is derived from it).
     */
    private function replayLedger(Facility $facility, User $staff, array $events): void
    {
        usort($events, fn ($a, $b) => $b[0] <=> $a[0]); // oldest first; stable for same day

        $ledger = app(StockLedgerService::class);

        foreach ($events as $event) {
            [$daysAgo, $sku, $type, $qty, $counterparty, $batchNo, $voucher] = $event;
            $type = TransactionType::from($type);
            $product = Product::findOrFail($this->productIds[$sku]);
            $date = CarbonImmutable::today()->subDays($daysAgo);

            $allocations = match (true) {
                $type === TransactionType::PhysicalCount => [[$batchNo, max(0, $this->onHand($facility, $sku, $batchNo) + $qty)]],
                $type->isOutbound() && $batchNo === null && $product->requires_batch_tracking => $this->allocateFefo($facility, $sku, $qty, $date),
                $type->isOutbound() => [[$batchNo, min($qty, $this->onHand($facility, $sku, $batchNo))]],
                default => [[$batchNo, $qty]],
            };

            foreach ($allocations as [$allocBatchNo, $amount]) {
                if ($amount === 0 && $type !== TransactionType::PhysicalCount) {
                    continue; // nothing left to issue — this is how stock-outs happen
                }

                $ledger->record(
                    facility: $facility,
                    product: $product,
                    type: $type,
                    quantity: $amount,
                    transactionDate: $date,
                    performedBy: $staff,
                    batchNo: $allocBatchNo,
                    voucherNo: $voucher,
                    counterparty: $counterparty,
                    comments: $event[7] ?? null,
                );
            }
        }
    }

    private function onHand(Facility $facility, string $sku, ?string $batchNo): int
    {
        return (int) StockBalance::query()
            ->where('facility_id', $facility->id)
            ->where('product_id', $this->productIds[$sku])
            ->where('batch_id', $batchNo === null ? null : $this->batches["{$sku}|{$batchNo}"]['id'])
            ->value('quantity_on_hand');
    }

    /** @return list<array{0:string, 1:int}> [batch_no, qty] pairs, earliest-expiring unexpired batch first */
    private function allocateFefo(Facility $facility, string $sku, int $qty, CarbonImmutable $date): array
    {
        $candidates = array_filter(
            $this->batches,
            fn ($b, $k) => str_starts_with($k, $sku.'|') && $b['expiry']->gt($date),
            ARRAY_FILTER_USE_BOTH,
        );
        uasort($candidates, fn ($a, $b) => $a['expiry'] <=> $b['expiry']);

        $allocations = [];
        foreach (array_keys($candidates) as $key) {
            $batchNo = explode('|', $key, 2)[1];
            $take = min($this->onHand($facility, $sku, $batchNo), $qty);
            if ($take > 0) {
                $allocations[] = [$batchNo, $take];
                $qty -= $take;
            }
            if ($qty === 0) {
                break;
            }
        }

        return $allocations; // may cover less than requested — i.e. stock ran out
    }
}
