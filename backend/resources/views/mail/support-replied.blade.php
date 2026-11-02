<x-mail::message>
# Support replied, {{ $name }}

<x-mail::panel>
{{ $body }}
</x-mail::panel>

Open {{ $platform }} to reply — use the chat button on the web dashboard, or **Support chat** in the mobile app. Please don’t reply to this email.

<x-mail::button :url="$url">
Open {{ $platform }}
</x-mail::button>

Thanks,<br>
{{ $platform }}
</x-mail::message>
