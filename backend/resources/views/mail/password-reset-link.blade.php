<x-mail::message>
# Reset your password, {{ $name }}

Someone — hopefully you — asked to reset the password of your {{ $platform }} account. Choose a new one with the button below.

<x-mail::button :url="$url">
Choose a new password
</x-mail::button>

The link works once, for {{ $minutes }} minutes. Choosing a new password signs you out on every device.

If the button doesn’t work, copy this address into your browser:<br>
{{ $url }}

If you didn’t ask for this, ignore this email — your password stays as it is.

Thanks,<br>
{{ $platform }}
</x-mail::message>
