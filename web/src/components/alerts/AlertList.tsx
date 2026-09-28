import { AlertOctagon, AlertTriangle, CalendarClock, Check, CheckCheck, PackageX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ALERT_TITLE, formatDate, timeAgo } from '../../lib/format'
import { useAlertAction } from '../../lib/queries'
import type { Alert, AlertType } from '../../lib/types'

const ICON: Record<AlertType, typeof PackageX> = {
  stock_out: PackageX,
  expired: AlertOctagon,
  low_stock: AlertTriangle,
  expiring_soon: CalendarClock,
}

const SEVERITY_TONE = { critical: 'critical', warning: 'warning', info: 'notice' } as const

function detail(a: Alert): string {
  if (a.batch) {
    const verb = a.alert_type === 'expired' ? 'expired' : 'expires'
    return `Batch ${a.batch.batch_no} ${verb} ${formatDate(a.batch.expiry_date)}`
  }
  return a.alert_type === 'stock_out' ? 'No usable stock left' : 'Usable stock below the minimum level'
}

function statusLine(a: Alert): string {
  if (a.status === 'resolved') {
    return a.resolved_by_name ? `Resolved by ${a.resolved_by_name} ${timeAgo(a.resolved_at)}` : `Cleared ${timeAgo(a.resolved_at)}`
  }
  if (a.status === 'acknowledged') return `Acknowledged by ${a.acknowledged_by_name ?? '—'} ${timeAgo(a.acknowledged_at)}`
  return `Raised ${timeAgo(a.created_at)}`
}

interface Props {
  alerts: Alert[]
  /** Show which facility each alert is at (rollup views); off on a facility's own page. */
  showFacility?: boolean
  /** Acknowledge / resolve buttons. */
  actions?: boolean
  compact?: boolean
  empty?: string
}

/** Alerts as a list, most severe first (the API's order). Status is always spelled out, never colour alone. */
export function AlertList({ alerts, showFacility = true, actions = true, compact = false, empty = 'No alerts.' }: Props) {
  const act = useAlertAction()

  if (alerts.length === 0) return <p className="empty">{empty}</p>

  return (
    <ul className={`alert-list${compact ? ' alert-list-compact' : ''}`}>
      {alerts.map((a) => {
        const Icon = ICON[a.alert_type]
        const busy = act.isPending && act.variables?.id === a.id
        return (
          <li key={a.id} className={`alert-item alert-${a.status}`}>
            <span className={`alert-icon alert-icon-${SEVERITY_TONE[a.severity]}`} aria-hidden>
              <Icon size={compact ? 16 : 18} />
            </span>
            <div className="alert-body">
              <div className="alert-title">
                <strong>{ALERT_TITLE[a.alert_type]}</strong>
                <span>{a.product.name}</span>
                {!compact && (
                  <span className={`badge badge-${SEVERITY_TONE[a.severity]} badge-plain`} style={{ textTransform: 'capitalize' }}>
                    {a.severity}
                  </span>
                )}
                {a.status === 'acknowledged' && <span className="badge badge-neutral badge-plain">Acknowledged</span>}
                {a.status === 'resolved' && <span className="badge badge-ok badge-plain">Resolved</span>}
              </div>
              <div className="alert-meta">
                {showFacility && (
                  <Link to={`/facilities/${a.facility.id}`} className="alert-facility">
                    {a.facility.name}
                  </Link>
                )}
                <span>{detail(a)}</span>
                <span>{statusLine(a)}</span>
                {a.status === 'resolved' && a.condition_active && <span className="text-warning">Condition still present</span>}
              </div>
            </div>
            {actions && a.status !== 'resolved' && (
              <div className="alert-actions">
                {a.status === 'open' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => act.mutate({ id: a.id, action: 'acknowledge' })}
                  >
                    <Check size={15} /> Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  title={a.condition_active ? 'It will not be raised again until the stock situation clears and recurs' : undefined}
                  onClick={() => act.mutate({ id: a.id, action: 'resolve' })}
                >
                  <CheckCheck size={15} /> Resolve
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
