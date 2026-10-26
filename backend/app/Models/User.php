<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserRole;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToOrganization, HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    /** Match the column defaults, so a freshly created model reads them without a refresh. */
    protected $attributes = [
        'is_active' => true,
        'must_change_password' => false,
    ];

    protected $fillable = [
        'organization_id',
        'name',
        'email',
        'password',
        'role',
        'facility_id',
        'lga_id',
        'state_id',
        'fcm_token',
        'is_active',
        'must_change_password',
        'email_verified_at',
        'created_by',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'fcm_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    /** The platform owner belongs to no organization. */
    protected function requiresOrganization(): bool
    {
        return $this->role !== UserRole::Owner;
    }

    public function isOwner(): bool
    {
        return $this->role === UserRole::Owner;
    }

    /**
     * Signed up on their own and hasn't confirmed their email yet. Accounts
     * someone else made confirm theirs by signing in with the temporary
     * password emailed to them and replacing it (AuthController::changePassword),
     * so they're never asked twice.
     */
    public function needsEmailVerification(): bool
    {
        return $this->email_verified_at === null && ! $this->must_change_password;
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function lga(): BelongsTo
    {
        return $this->belongsTo(Lga::class);
    }

    public function state(): BelongsTo
    {
        return $this->belongsTo(State::class);
    }
}
