<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->h = hierarchyFixture();
});

it('logs in with valid credentials and returns a working token', function () {
    $user = $this->h['users']['sdp'];

    $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'password'])
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.role', 'sdp_staff')
        ->json('data.token');

    $this->withToken($token)->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.node', [
            'level' => 'facility',
            'id' => $this->h['facilities']['kawo']->id,
            'name' => 'Kawo PHC',
            'path' => ['Kaduna', 'Kaduna North', 'Kawo PHC'],
        ]);
});

it('rejects bad credentials with a 422 on email', function () {
    $this->postJson('/api/v1/auth/login', ['email' => $this->h['users']['sdp']->email, 'password' => 'nope'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('throttles repeated login attempts', function () {
    foreach (range(1, 6) as $_) {
        $this->postJson('/api/v1/auth/login', ['email' => 'x@y.test', 'password' => 'nope']);
    }

    $this->postJson('/api/v1/auth/login', ['email' => 'x@y.test', 'password' => 'nope'])->assertTooManyRequests();
});

it('revokes the token on logout', function () {
    $token = $this->postJson('/api/v1/auth/login', ['email' => $this->h['users']['lga']->email, 'password' => 'password'])
        ->json('data.token');

    $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();

    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();
});

it('describes each role\'s node', function (string $role, string $level, array $path) {
    $this->actingAs($this->h['users'][$role], 'sanctum')
        ->getJson('/api/v1/auth/me')
        ->assertJsonPath('data.node.level', $level)
        ->assertJsonPath('data.node.path', $path);
})->with([
    ['lga', 'lga', ['Kaduna', 'Kaduna North']],
    ['state', 'state', ['Kaduna']],
    ['federal', 'national', ['Nigeria']],
    ['admin', 'national', ['Nigeria']],
]);

it('never exposes secrets', function () {
    $user = User::factory()->create(['fcm_token' => 'secret-fcm']);

    $json = $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->json('data');

    expect($json)->not->toHaveKeys(['password', 'remember_token', 'fcm_token']);
});
