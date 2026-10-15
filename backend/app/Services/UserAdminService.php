<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Creating and changing other people's accounts. Who may do what is decided
 * by HierarchyScope (via UserPolicy and the form requests); this only applies it.
 *
 * Passwords set here are temporary: the account must change it at its next
 * sign-in (EnsureAccountUsable). Deactivating or resetting signs the account
 * out everywhere.
 */
class UserAdminService
{
    /** No 0/O, 1/l/I: these get read out over the phone and copied by hand. */
    private const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function temporaryPassword(int $length = 10): string
    {
        $max = strlen(self::PASSWORD_ALPHABET) - 1;

        return implode('', array_map(fn () => self::PASSWORD_ALPHABET[random_int(0, $max)], range(1, $length)));
    }

    /**
     * @param  array{name: string, email: string, role: string, facility_id?: int|null, lga_id?: int|null, state_id?: int|null}  $data
     * @return array{User, string} the account and its temporary password, shown once
     */
    public function create(array $data, User $by, ?string $password = null): array
    {
        $password ??= self::temporaryPassword();
        $role = UserRole::from($data['role']);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $password,
            'role' => $role,
            ...self::anchor($role, $data),
            'is_active' => true,
            'must_change_password' => true,
            'created_by' => $by->id,
        ]);

        return [$user, $password];
    }

    /** @param  array{name?: string, email?: string, role?: string, facility_id?: int|null, lga_id?: int|null, state_id?: int|null, is_active?: bool}  $data */
    public function update(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            $role = isset($data['role']) ? UserRole::from($data['role']) : $user->role;
            $fields = array_intersect_key($data, array_flip(['name', 'email', 'is_active']));

            if (isset($data['role']) || array_intersect_key($data, array_flip(['facility_id', 'lga_id', 'state_id']))) {
                $fields = [...$fields, 'role' => $role, ...self::anchor($role, [...$user->only(['facility_id', 'lga_id', 'state_id']), ...$data])];
            }

            $user->update($fields);

            if ($user->wasChanged('is_active') && ! $user->is_active) {
                $this->signOutEverywhere($user);
            }

            return $user;
        });
    }

    /** @return string the new temporary password, shown once */
    public function resetPassword(User $user): string
    {
        $password = self::temporaryPassword();
        $user->update(['password' => $password, 'must_change_password' => true]);
        $this->signOutEverywhere($user);

        return $password;
    }

    private function signOutEverywhere(User $user): void
    {
        $user->tokens()->delete();
        $user->update(['fcm_token' => null]);
    }

    /**
     * Exactly one of facility_id / lga_id / state_id, matching the role
     * (docs/DATABASE_SCHEMA.md); federal officers and admins have none.
     *
     * @param  array<string, mixed>  $data
     * @return array{facility_id: int|null, lga_id: int|null, state_id: int|null}
     */
    private static function anchor(UserRole $role, array $data): array
    {
        $column = $role->nodeColumn();

        return [
            'facility_id' => $column === 'facility_id' ? $data['facility_id'] : null,
            'lga_id' => $column === 'lga_id' ? $data['lga_id'] : null,
            'state_id' => $column === 'state_id' ? $data['state_id'] : null,
        ];
    }
}
