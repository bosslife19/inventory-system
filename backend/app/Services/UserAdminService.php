<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\Facility;
use App\Models\Lga;
use App\Models\State;
use App\Models\User;
use App\Support\AccountMail;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Creating and changing other people's accounts. Who may do what is decided
 * by HierarchyScope (via UserPolicy and the form requests); this only applies it.
 *
 * Passwords set here are temporary: the account must change it at its next
 * sign-in (EnsureAccountUsable). A new account is emailed its temporary
 * password and how to sign in (AccountMail). Deactivating or resetting signs
 * the account out everywhere.
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
     * @return array{User, string} the account and its temporary password, shown once (and emailed to it)
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

        AuditLog::record(
            'user.created',
            "Account created for {$user->name} ({$user->email}) as ".self::roleLabel($user->role).self::at($user),
            $user, AuditLog::placeOfUser($user),
            AuditLog::snapshot($user, ['name', 'email', 'role', 'facility_id', 'lga_id', 'state_id']),
            actor: $by,
        );
        AccountMail::accountCreated($user, $password);

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

            $place = AuditLog::placeOfUser($user); // before the move, so the old area sees it leave
            $user->update($fields);
            $changes = AuditLog::diff($user);
            $user->unsetRelations(); // the facility / LGA / state may have just changed

            if ($user->wasChanged('is_active') && ! $user->is_active) {
                $this->signOutEverywhere($user);
            }

            if ($changes !== []) {
                $action = match (true) {
                    $user->wasChanged('is_active') => $user->is_active ? 'user.reactivated' : 'user.deactivated',
                    default => 'user.updated',
                };
                $verb = ['user.reactivated' => 'reactivated', 'user.deactivated' => 'deactivated', 'user.updated' => 'updated'][$action];
                AuditLog::record($action, "Account of {$user->name} {$verb}".self::at($user), $user, $place ?? AuditLog::placeOfUser($user), $changes);
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
        AuditLog::record('user.password_reset', "Password of {$user->name} reset to a temporary one".self::at($user), $user, AuditLog::placeOfUser($user));

        return $password;
    }

    private static function roleLabel(UserRole $role): string
    {
        return str_replace('_', ' ', $role === UserRole::SdpStaff ? 'facility staff' : $role->value);
    }

    /** " at Kawo PHC" / " for Zaria LGA" / " for Kaduna State" / "" */
    private static function at(User $user): string
    {
        $place = AuditLog::placeOfUser($user);

        return match (true) {
            $place instanceof Facility => " at {$place->name}",
            $place instanceof Lga => " for {$place->name} LGA",
            $place instanceof State => " for {$place->name} State",
            default => '',
        };
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
