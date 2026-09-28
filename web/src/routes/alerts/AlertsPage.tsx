import { AlertOctagon, AlertTriangle, BellRing, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { AlertList } from '../../components/alerts/AlertList'
import { ErrorState } from '../../components/layout/PageState'
import { KpiTile } from '../../components/ui/KpiTile'
import { ALERT_TITLE, formatQty } from '../../lib/format'
import { type AlertFilters, useAlertCount, useAlerts } from '../../lib/queries'
import type { AlertSeverity, AlertStatus, AlertType } from '../../lib/types'

const STATUS_TABS: { value: AlertStatus | undefined; label: string }[] = [
  { value: undefined, label: 'Needs attention' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
]

/** Every alert in the user's scope (the API decides the scope), with filters and follow-up actions. */
export function AlertsPage() {
  const [filters, setFilters] = useState<AlertFilters>({ page: 1, per_page: 25 })
  const set = (patch: Partial<AlertFilters>) => setFilters({ ...filters, page: 1, ...patch })
  const alerts = useAlerts(filters)
  const critical = useAlertCount({ severity: 'critical' })
  const warning = useAlertCount({ severity: 'warning' })
  const open = useAlertCount({ status: 'open' })
  const acknowledged = useAlertCount({ status: 'acknowledged' })
  const pagination = alerts.data?.meta.pagination
  const show = (n: number | undefined) => (n === undefined ? '—' : formatQty(n))

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Alerts</p>
          <h1>Stock alerts</h1>
          <p className="muted">
            Raised automatically when stock runs out, falls below minimum, or a batch is expiring — and cleared when the
            situation is fixed.
          </p>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiTile tone={critical.data ? 'critical' : 'default'} icon={AlertOctagon} label="Critical" value={show(critical.data)} sub="Stock-outs and expired batches" />
        <KpiTile tone={warning.data ? 'warning' : 'default'} icon={AlertTriangle} label="Warnings" value={show(warning.data)} sub="Below the minimum level" />
        <KpiTile tone="primary" icon={BellRing} label="Open" value={show(open.data)} sub="Not yet acknowledged" />
        <KpiTile tone="dark" icon={CheckCheck} label="Acknowledged" value={show(acknowledged.data)} sub="Being followed up" />
      </div>

      <section className="card">
        <div className="card-head">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS_TABS.map((t) => (
              <button key={t.label} type="button" aria-pressed={filters.status === t.value} onClick={() => set({ status: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="filters">
            <select
              aria-label="Severity"
              value={filters.severity ?? ''}
              onChange={(e) => set({ severity: (e.target.value || undefined) as AlertSeverity | undefined })}
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              aria-label="Alert type"
              value={filters.alert_type ?? ''}
              onChange={(e) => set({ alert_type: (e.target.value || undefined) as AlertType | undefined })}
            >
              <option value="">All types</option>
              {(Object.keys(ALERT_TITLE) as AlertType[]).map((t) => (
                <option key={t} value={t}>
                  {ALERT_TITLE[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {alerts.isError ? (
          <ErrorState error={alerts.error} />
        ) : alerts.isPending ? (
          <p className="empty">Loading…</p>
        ) : (
          <div className={alerts.isFetching ? 'is-fetching' : undefined}>
            <AlertList
              alerts={alerts.data.data}
              empty={filters.status === 'resolved' ? 'No resolved alerts.' : 'Nothing needs attention right now.'}
            />
          </div>
        )}

        {pagination && pagination.last_page > 1 && (
          <nav className="pager" aria-label="Pages">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pagination.current_page <= 1}
              onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}
            >
              ← Previous
            </button>
            <span className="muted">
              Page {pagination.current_page} of {pagination.last_page} · {formatQty(pagination.total)} alerts
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pagination.current_page >= pagination.last_page}
              onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
            >
              Next →
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}
