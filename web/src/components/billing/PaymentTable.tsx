import { formatDate, formatNaira } from '../../lib/format'
import type { Payment, PaymentStatus } from '../../lib/types'

const STATUS: Record<PaymentStatus, { label: string; badge: string }> = {
  success: { label: 'Paid', badge: 'badge-ok' },
  pending: { label: 'Not finished', badge: 'badge-warning' },
  failed: { label: 'Failed', badge: 'badge-critical' },
  abandoned: { label: 'Cancelled', badge: 'badge-neutral' },
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})
const months = (n: number) => (n === 1 ? '1 month' : `${n} months`)

/** Paystack payments for a plan tier: the organization's own (Billing) or one organization's (owner console). */
export function PaymentTable({ payments }: { payments: Payment[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Plan</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th className="hide-sm">Covers</th>
            <th className="hide-sm">Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="nowrap">
                {p.paid_at || p.created_at ? dateTime.format(new Date((p.paid_at ?? p.created_at)!)) : '—'}
              </td>
              <td>
                <div className="cell-title">{p.plan_tier.name}</div>
                <div className="muted small">
                  {months(p.months)}
                  {p.paid_by ? ` · ${p.paid_by}` : ''}
                </div>
              </td>
              <td className="num nowrap">{formatNaira(p.amount)}</td>
              <td>
                <span className={`badge ${STATUS[p.status].badge}`} title={p.failure_reason ?? undefined}>
                  {STATUS[p.status].label}
                </span>
                {p.channel && <div className="muted small">{p.channel.replace('_', ' ')}</div>}
              </td>
              <td className="hide-sm small nowrap">
                {p.period_start ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}` : '—'}
              </td>
              <td className="hide-sm small mono">{p.reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
