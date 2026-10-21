import { CalendarClock } from 'lucide-react'
import { formatDate } from '../../lib/format'
import type { Membership } from '../../lib/types'

/** From two weeks before a paid plan ends: when it ends, and that nothing recorded is lost. */
export function RenewalBanner({ organization: o }: { organization: Membership }) {
  if (!o.renewal_due || o.days_left === null || o.paid_until === null) return null

  return (
    <div className="renewal-banner" role="status">
      <CalendarClock size={18} aria-hidden />
      <span>
        {o.name}’s paid plan ends {o.days_left === 1 ? 'today' : `in ${o.days_left} days`} ({formatDate(o.paid_until)}). After that the
        dashboards, dispatches, imports and push notifications pause until it’s renewed — Stock Cards keep working.
      </span>
    </div>
  )
}
