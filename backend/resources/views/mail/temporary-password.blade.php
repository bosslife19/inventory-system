<x-mail::message>
# Your password was reset, {{ $name }}

Whoever manages your account on {{ $platform }} has reset your password. You’ve been signed out on every device.

<x-mail::panel>
Email: **{{ $email }}**<br>
Temporary password: **{{ $password }}**
</x-mail::panel>

Sign in with the temporary password, on the web or in the mobile app. You’ll be asked to choose your own password straight away.

<x-mail::button :url="$signInUrl">
Sign in to {{ $platform }}
</x-mail::button>

If you didn’t ask for this, tell whoever manages your organization.

Thanks,<br>
{{ $platform }}
</x-mail::message>
