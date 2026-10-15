import { Bell, Building2, ChevronDown, ChevronRight, ClipboardList, History, Package, Search, Truck, UserCog } from 'lucide-react'
import { Fragment, useState } from 'react'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { ROLE_LABEL, formatQty, todayInLagos } from '../../lib/format'
import { type AuditFilters, useAuditEvents } from '../../lib/queries'
import type { AuditEvent } from '../../lib/types'

const CATEGORIES: { value: AuditFilters['category']; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'stock', label: 'Stock Card' },
  { value: 'deliveries', label: 'Deliveries' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'catalog', label: 'Products' },
  { value: 'alerts', label: 'Alerts' },
]

const ICON = { stock: ClipboardList, deliveries: Truck, accounts: UserCog, facilities: Building2, catalog: Package, alerts: Bell } as const

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })

/** Field names as people say them. */
const FIELD: Record<string, string> = {
  is_active: 'Active',
  min_stock_level: 'Minimum level',
  reorder_level: 'Reorder level (EOP)',
  max_stock_level: 'Maximum level',
  requires_batch_tracking: 'Batch tracking',
  requires_cold_chain: 'Cold chain',
  unit_of_measure: 'Unit',
  facility_id: 'Facility (id)',
  lga_id: 'LGA (id)',
  state_id: 'State (id)',
}
const fieldLabel = (f: string) => FIELD[f] ?? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' ')
const value = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : v === true ? 'Yes' : v === false ? 'No' : String(v))

/**
 * The audit log: every Stock Card entry, delivery, account change, catalog
 * or facility edit and alert action, with who did it and where — scoped to
 * the signed-in user's area by the API. Read-only.
 */
export function ActivityPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, per_page: 50 })
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const events = useAuditEvents(filters)
  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }))

  const rows = events.data?.data ?? []
  const pagination = events.data?.meta.pagination

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Audit</p>
          <h1>Activity log</h1>
          <p className="muted">Who did what, where and when — every entry and change in your area. Nothing here can be edited.</p>
        </div>
      </header>

      <section className="card card-flush">
        <div className="card-head">
          <div className="segmented" role="group" aria-label="Kind of activity">
            {CATEGORIES.map((c) => (
              <button key={c.label} type="button" aria-pressed={filters.category === c.value} onClick={() => set({ category: c.value })}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="filters">
            <input type="date" aria-label="From" value={filters.from ?? ''} max={filters.to ?? todayInLagos()} onChange={(e) => set({ from: e.target.value || undefined })} />
            <input type="date" aria-label="To" value={filters.to ?? ''} min={filters.from} max={todayInLagos()} onChange={(e) => set({ to: e.target.value || undefined })} />
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault()
                set({ q: query.trim() || undefined })
              }}
            >
              <Search size={16} />
              <input
                type="search"
                placeholder="Product, voucher, name…"
                aria-label="Search activity"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (!e.target.value) set({ q: undefined })
                }}
              />
            </form>
          </div>
        </div>

        {events.isError ? (
          <ErrorState error={events.error} />
        ) : events.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <History size={28} aria-hidden />
            No activity matches these filters.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th className="hide-sm">Who</th>
                  <th className="hide-sm">Where</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const Icon = ICON[e.category]
                  const hasChanges = e.changes && Object.keys(e.changes).length > 0
                  const isOpen = open === e.id
                  return (
                    <Fragment key={e.id}>
                      <tr className={hasChanges ? 'row-link' : undefined} onClick={hasChanges ? () => setOpen(isOpen ? null : e.id) : undefined}>
                        <td className="nowrap small">{when.format(new Date(e.occurred_at))}</td>
                        <td>
                          <span className="activity-what">
                            <Icon size={15} aria-hidden />
                            <span>
                              {e.summary}
                              {hasChanges && (
                                <button
                                  type="button"
                                  className="link-button small activity-toggle"
                                  aria-expanded={isOpen}
                                  onClick={(ev) => {
                                    ev.stopPropagation()
                                    setOpen(isOpen ? null : e.id)
                                  }}
                                >
                                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} details
                                </button>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="hide-sm">
                          {e.actor ? (
                            <>
                              <div className="cell-title">{e.actor.name}</div>
                              <div className="muted small">{ROLE_LABEL[e.actor.role]}</div>
                            </>
                          ) : (
                            <span className="muted small">Unknown</span>
                          )}
                        </td>
                        <td className="hide-sm small">{place(e)}</td>
                      </tr>
                      {isOpen && hasChanges && (
                        <tr className="activity-details">
                          <td />
                          <td colSpan={3}>
                            <Changes event={e} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.last_page > 1 && (
          <nav className="pager" aria-label="Pages" style={{ padding: '0 1.25rem 1.1rem' }}>
            <button type="button" className="btn btn-ghost" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
              ← Newer
            </button>
            <span className="muted">
              Page {pagination.current_page} of {formatQty(pagination.last_page)} · {formatQty(pagination.total)} entries
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={filters.page >= pagination.last_page}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Older →
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}

function place(e: AuditEvent): string {
  const parts = [e.place.facility, e.place.lga && `${e.place.lga} LGA`, e.place.state].filter(Boolean)
  return parts.length ? parts.join(', ') : 'National'
}

/** Before → after for edits; the values set for creations. */
function Changes({ event }: { event: AuditEvent }) {
  const entries = Object.entries(event.changes ?? {})
  const isDiff = entries.every(([, v]) => Array.isArray(v) && v.length === 2)

  return (
    <dl className="activity-changes">
      {entries.map(([field, v]) => (
        <div key={field}>
          <dt>{fieldLabel(field)}</dt>
          <dd>
            {isDiff ? (
              <>
                <span className="muted">{value((v as unknown[])[0])}</span> → <strong>{value((v as unknown[])[1])}</strong>
              </>
            ) : (
              value(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
