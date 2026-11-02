<x-mail::message>
# Payment received

@if ($name)
Thanks, {{ $name }}. {{ $organization }} is paid up on {{ $platform }}.
@else
{{ $organization }} is paid up on {{ $platform }}.
@endif

<x-mail::table>
| | |
|:--|:--|
| Plan | {{ $tier }}, {{ $months }} {{ $months === 1 ? 'month' : 'months' }} |
| Amount | **{{ $amount }}** |
| Paid | {{ $paidAt }}{{ $channel ? ' · '.$channel : '' }} |
| Paid period | {{ $periodStart }} – {{ $periodEnd }} |
| Reference | {{ $reference }} |
</x-mail::table>

@if ($creditDays > 0)
{{ $creditDays }} {{ $creditDays === 1 ? 'day' : 'days' }} left on your previous plan were carried over into this period.
@endif

<x-mail::button :url="$url">
See billing
</x-mail::button>

Keep this email as your receipt.

Thanks,<br>
{{ $platform }}
</x-mail::message>
