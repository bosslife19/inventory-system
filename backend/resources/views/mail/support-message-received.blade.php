<x-mail::message>
# New support message

@if ($organization)
**{{ $name }}** ({{ $email }}) of {{ $organization }} wrote:
@else
**{{ $name }}** ({{ $email }}) wrote:
@endif

<x-mail::panel>
{{ $body }}
</x-mail::panel>

<x-mail::button :url="$url">
Reply in the owner console
</x-mail::button>

You’re emailed once per conversation until you read it; later messages wait in the console.

{{ $platform }}
</x-mail::message>
