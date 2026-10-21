<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use App\Services\UserAdminService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

/**
 * Make a platform owner account (manages organizations, sees none of their
 * data). On a temporary password, printed once, changed at first sign-in.
 */
class CreateOwner extends Command
{
    protected $signature = 'owner:create {email} {name}';

    protected $description = 'Create a platform owner account on a temporary password';

    public function handle(): int
    {
        $data = ['email' => $this->argument('email'), 'name' => $this->argument('name')];
        $validator = Validator::make($data, ['email' => ['required', 'email', 'unique:users,email'], 'name' => ['required', 'max:255']]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }

        $password = UserAdminService::temporaryPassword(12);
        User::create([...$data, 'password' => $password, 'role' => UserRole::Owner, 'is_active' => true, 'must_change_password' => true]);

        $this->info("Owner account {$data['email']} created. Temporary password (shown once): {$password}");

        return self::SUCCESS;
    }
}
