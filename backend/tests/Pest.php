<?php

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(Tests\TestCase::class)
 // ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Two states, each with two LGAs, each with one facility, plus a user at
 * every level anchored in the first branch (Kaduna > Kaduna North > Kawo).
 * Everything in the second branch of each level is "sideways" for them.
 *
 * @return array<string, mixed>
 */
function hierarchyFixture(): array
{
    $kaduna = App\Models\State::create(['name' => 'Kaduna', 'geopolitical_zone' => 'north_west']);
    $lagos = App\Models\State::create(['name' => 'Lagos', 'geopolitical_zone' => 'south_west']);
    $kadunaNorth = App\Models\Lga::create(['state_id' => $kaduna->id, 'name' => 'Kaduna North']);
    $zaria = App\Models\Lga::create(['state_id' => $kaduna->id, 'name' => 'Zaria']);
    $ikeja = App\Models\Lga::create(['state_id' => $lagos->id, 'name' => 'Ikeja']);
    $kawo = App\Models\Facility::create(['lga_id' => $kadunaNorth->id, 'name' => 'Kawo PHC', 'type' => 'health_center']);
    $rimi = App\Models\Facility::create(['lga_id' => $kadunaNorth->id, 'name' => 'Rimi PHC', 'type' => 'health_center']);
    $tudun = App\Models\Facility::create(['lga_id' => $zaria->id, 'name' => 'Tudun Wada PHC', 'type' => 'health_center']);
    $ikejaGh = App\Models\Facility::create(['lga_id' => $ikeja->id, 'name' => 'Ikeja GH', 'type' => 'hospital']);

    $factory = fn () => App\Models\User::factory();

    return [
        'states' => compact('kaduna', 'lagos'),
        'lgas' => compact('kadunaNorth', 'zaria', 'ikeja'),
        'facilities' => compact('kawo', 'rimi', 'tudun', 'ikejaGh'),
        'users' => [
            'sdp' => $factory()->sdpStaff($kawo->id)->create(),
            'lga' => $factory()->lgaOfficer($kadunaNorth->id)->create(),
            'state' => $factory()->stateOfficer($kaduna->id)->create(),
            'federal' => $factory()->create(),
            'admin' => $factory()->admin()->create(),
        ],
    ];
}
