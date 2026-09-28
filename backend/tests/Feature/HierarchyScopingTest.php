<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/*
 * Own node and below, never above or sideways (docs/ARCHITECTURE.md,
 * docs/ROLES_AND_PERMISSIONS.md). Checked on every read endpoint.
 */

beforeEach(function () {
    $this->h = hierarchyFixture();
    $f = $this->h['facilities'];
    $l = $this->h['lgas'];
    $s = $this->h['states'];

    // endpoint => [who may see it]
    $this->matrix = [
        "/api/v1/facilities/{$f['kawo']->id}" => ['sdp', 'lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['rimi']->id}" => ['lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['tudun']->id}" => ['state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['ikejaGh']->id}" => ['federal', 'admin'],
        "/api/v1/facilities/{$f['kawo']->id}/stock-balances" => ['sdp', 'lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['rimi']->id}/stock-balances" => ['lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['kawo']->id}/stock-transactions" => ['sdp', 'lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['ikejaGh']->id}/stock-transactions" => ['federal', 'admin'],
        "/api/v1/lgas/{$l['kadunaNorth']->id}/facilities" => ['lga', 'state', 'federal', 'admin'],
        "/api/v1/lgas/{$l['zaria']->id}/facilities" => ['state', 'federal', 'admin'],
        "/api/v1/lgas/{$l['kadunaNorth']->id}/stock-summary" => ['lga', 'state', 'federal', 'admin'],
        "/api/v1/lgas/{$l['ikeja']->id}/stock-summary" => ['federal', 'admin'],
        "/api/v1/lgas/{$l['kadunaNorth']->id}/stock-activity" => ['lga', 'state', 'federal', 'admin'],
        "/api/v1/lgas/{$l['zaria']->id}/stock-activity" => ['state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['kawo']->id}/stock-activity" => ['sdp', 'lga', 'state', 'federal', 'admin'],
        "/api/v1/facilities/{$f['tudun']->id}/stock-activity" => ['state', 'federal', 'admin'],
        "/api/v1/states/{$s['kaduna']->id}/lgas" => ['state', 'federal', 'admin'],
        "/api/v1/states/{$s['lagos']->id}/lgas" => ['federal', 'admin'],
    ];
});

it('allows exactly the right roles on every scoped endpoint', function () {
    foreach ($this->matrix as $url => $allowed) {
        foreach ($this->h['users'] as $role => $user) {
            $status = $this->actingAs($user, 'sanctum')->getJson($url)->status();
            $expected = in_array($role, $allowed, true) ? 200 : 403;

            expect($status)->toBe($expected, "{$role} GET {$url}: expected {$expected}, got {$status}");
        }
    }
});

it('filters list endpoints to the caller\'s scope', function (string $role, array $states) {
    $names = $this->actingAs($this->h['users'][$role], 'sanctum')->getJson('/api/v1/states')->json('data.*.name');

    expect($names)->toBe($states);
})->with([
    ['sdp', []],
    ['lga', []],
    ['state', ['Kaduna']],
    ['federal', ['Kaduna', 'Lagos']],
]);

it('lists all LGAs in the state for a state officer', function () {
    $this->actingAs($this->h['users']['state'], 'sanctum')
        ->getJson("/api/v1/states/{$this->h['states']['kaduna']->id}/lgas")
        ->assertJsonPath('data.*.name', ['Kaduna North', 'Zaria']);
});

it('lists facilities in the LGA for an LGA officer', function () {
    $this->actingAs($this->h['users']['lga'], 'sanctum')
        ->getJson("/api/v1/lgas/{$this->h['lgas']['kadunaNorth']->id}/facilities")
        ->assertJsonPath('data.*.name', ['Kawo PHC', 'Rimi PHC'])
        ->assertJsonPath('data.0.state.name', 'Kaduna');
});

it('lets every authenticated role read the product catalog', function () {
    foreach ($this->h['users'] as $user) {
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/products')->assertOk();
    }
});

it('requires authentication everywhere except login', function () {
    foreach (array_keys($this->matrix) as $url) {
        $this->getJson($url)->assertUnauthorized();
    }
    $this->getJson('/api/v1/products')->assertUnauthorized();
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
});
