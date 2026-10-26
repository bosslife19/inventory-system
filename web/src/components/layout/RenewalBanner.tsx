import { CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate } from '../../lib/format'
import type { Membership } from '../../lib/types'
import { useUser } from '../../lib/user-context'

/** From two weeks before a paid plan ends: when it ends, that nothing recorded is lost, and (for admins) where to renew. */
export function RenewalBanner({ organization: o }: { organization: Membership }) {
  const isAdmin = useUser().role === 'admin'
  if (!o.renewal_due || o.days_left === null || o.paid_until === null) return null

  return (
    <div className="renewal-banner" role="status">
      <CalendarClock size={18} aria-hidden />
      <span>
        {o.name}’s paid plan ends {o.days_left === 1 ? 'today' : `in ${o.days_left} days`} ({formatDate(o.paid_until)}).
        After that dispatches, scanning, imports, push notifications and extra accounts and facilities pause until it’s
        renewed — Stock Cards keep working.{' '}
        {isAdmin && (
          <Link to="/billing" className="renewal-link">
            Renew now
          </Link>
        )}
      </span>
    </div>
  )
}
