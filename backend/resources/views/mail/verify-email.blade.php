<x-mail::message>
# Confirm your email, {{ $name }}

@if ($organization)
Thanks for signing up {{ $organization }} on {{ $platform }}.
@else
Thanks for signing up on {{ $platform }}.
@endif
Confirm this is your email address to start using it.

<x-mail::button :url="$url">
Confirm my email
</x-mail::button>

The link works for {{ $hours }} hours. If it has expired, sign in and ask for a new one.

If the button doesn’t work, copy this address into your browser:<br>
{{ $url }}

If you didn’t sign up, you can ignore this message.

Thanks,<br>
{{ $platform }}
</x-mail::message>
