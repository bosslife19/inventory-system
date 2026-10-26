<x-mail::message>
# Welcome, {{ $name }}

@if ($organization)
An account has been set up for you on {{ $platform }}, as **{{ $role }}** for **{{ $organization }}**.
@else
An account has been set up for you on {{ $platform }}, as **{{ $role }}**.
@endif

@if ($isAdmin && $organization)
As an admin you add {{ $organization }}’s facilities, products and the accounts of everyone else who uses it.
@endif

**Your sign-in details**

<x-mail::panel>
Email: **{{ $email }}**<br>
Temporary password: **{{ $password }}**
</x-mail::panel>

**How to sign in**

1. Open the {{ $platform }} dashboard (button below), or the mobile app if you use one.
2. Sign in with your email and the temporary password above.
3. You’ll be asked to choose your own password straight away. Choose one only you know — the temporary password stops working once you do.

<x-mail::button :url="$signInUrl">
Sign in to {{ $platform }}
</x-mail::button>

If the button doesn’t work, go to {{ $signInUrl }}.

Don’t share this email or your password. If you weren’t expecting this account, you can ignore this message, or tell whoever manages your organization.

Thanks,<br>
{{ $platform }}
</x-mail::message>
