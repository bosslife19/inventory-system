<?php

namespace App\Mail;

use App\Models\Payment;
use App\Support\MailOut;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** To the admin who paid: a receipt for a successful Paystack payment and the paid period it bought. */
class PaymentReceipt extends Mailable
{
    public function __construct(
        public readonly Payment $payment,
        public readonly string $platform,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Receipt: {$this->payment->organization->name} — {$this->payment->tier->name} plan");
    }

    public function content(): Content
    {
        $p = $this->payment;

        return new Content(markdown: 'mail.payment-receipt', with: [
            'name' => $p->user?->name,
            'organization' => $p->organization->name,
            'tier' => $p->tier->name,
            'months' => $p->months,
            'amount' => '₦'.number_format($p->amount_kobo / 100, 2),
            'reference' => $p->reference,
            'channel' => $p->channel ? str_replace('_', ' ', $p->channel) : null,
            'paidAt' => $p->paid_at?->timezone('Africa/Lagos')->format('j M Y, H:i'),
            'periodStart' => $p->period_start?->format('j M Y'),
            'periodEnd' => $p->period_end?->format('j M Y'),
            'creditDays' => $p->credit_days,
            'platform' => $this->platform,
            'url' => MailOut::frontend('billing'),
        ]);
    }
}
