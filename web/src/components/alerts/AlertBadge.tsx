import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAlertCount, useAlerts } from '../../lib/queries'
import { AlertList } from './AlertList'

/**
 * Bell with the number of open (unacknowledged) alerts, opening a short list
 * of what needs attention. The backend scopes alerts to the user; nothing
 * is filtered here (web/CLAUDE.md rule 5).
 */
export function AlertBadge() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const count = useAlertCount({ status: 'open' })
  const recent = useAlerts({ per_page: 6 })
  const n = count.data ?? 0

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="btn btn-icon bell-btn"
        aria-label={`Alerts: ${n} open`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {n > 0 && <span className="bell-count">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Alerts">
          <div className="bell-panel-head">
            <strong>Alerts</strong>
            <span className="muted small">{n} open</span>
          </div>
          <div className="bell-panel-body">
            {recent.isPending ? (
              <p className="empty">Loading…</p>
            ) : (
              <AlertList alerts={recent.data?.data ?? []} actions={false} compact empty="Nothing needs attention." />
            )}
          </div>
          <Link to="/alerts" className="bell-panel-foot" onClick={() => setOpen(false)}>
            View all alerts
          </Link>
        </div>
      )}
    </div>
  )
}
