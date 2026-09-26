<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            // federal_officer needs no facility/lga/state id, so the default is always valid.
            'role' => 'federal_officer',
            'remember_token' => Str::random(10),
        ];
    }

    public function sdpStaff(int $facilityId): static
    {
        return $this->state(fn () => ['role' => 'sdp_staff', 'facility_id' => $facilityId]);
    }

    public function lgaOfficer(int $lgaId): static
    {
        return $this->state(fn () => ['role' => 'lga_officer', 'lga_id' => $lgaId]);
    }

    public function stateOfficer(int $stateId): static
    {
        return $this->state(fn () => ['role' => 'state_officer', 'state_id' => $stateId]);
    }

    public function admin(): static
    {
        return $this->state(fn () => ['role' => 'admin']);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
