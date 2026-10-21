import { formatDate } from '../../lib/format'
import type { Organization } from '../../lib/types'

/** Plan in force today, with when a paid one ends; suspended trumps both. */
export function PlanBadge({ organization: o }: { organization: Organization }) {
  if (!o.is_active) return <span className="badge badge-critical">Suspended</span>
  if (o.effective_plan === 'free') {
    return (
      <span className="badge badge-neutral" title={o.plan === 'paid' && o.paid_until ? `Paid plan ended ${formatDate(o.paid_until)}` : undefined}>
        Free{o.plan === 'paid' ? ' · lapsed' : ''}
      </span>
    )
  }
  const due = o.days_left !== null && o.days_left <= 14

  return (
    <span className={`badge ${due ? 'badge-warning' : 'badge-ok'}`}>
      Paid{o.paid_until ? ` · to ${formatDate(o.paid_until)}` : ''}
    </span>
  )
}
