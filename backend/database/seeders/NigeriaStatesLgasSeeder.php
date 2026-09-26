<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds all 36 states + FCT and their 774 LGAs from
 * database/seeders/data/nigeria_states_lgas.json (built by
 * scripts/build_nigeria_lgas.py — see that script for source and fixes).
 *
 * Idempotent: safe to re-run; existing rows are matched by name.
 */
class NigeriaStatesLgasSeeder extends Seeder
{
    public function run(): void
    {
        $data = json_decode(
            file_get_contents(__DIR__.'/data/nigeria_states_lgas.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        $now = now();

        DB::transaction(function () use ($data, $now) {
            DB::table('states')->upsert(
                array_map(fn ($s) => [
                    'name' => $s['state'],
                    'geopolitical_zone' => $s['geopolitical_zone'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $data),
                ['name'],
                ['geopolitical_zone', 'updated_at'],
            );

            $stateIds = DB::table('states')->pluck('id', 'name');

            $lgas = [];
            foreach ($data as $s) {
                foreach ($s['lgas'] as $lga) {
                    $lgas[] = [
                        'state_id' => $stateIds[$s['state']],
                        'name' => $lga,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }

            DB::table('lgas')->upsert($lgas, ['state_id', 'name'], ['updated_at']);
        });

        $this->command?->info(sprintf(
            'Seeded %d states, %d LGAs.',
            DB::table('states')->count(),
            DB::table('lgas')->count(),
        ));
    }
}
