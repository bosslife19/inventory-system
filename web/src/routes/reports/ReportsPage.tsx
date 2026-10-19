import { AlertCircle, CalendarClock, ClipboardList, Download, FileText, PackageSearch, Printer, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { useLgaFacilities, useLgas } from '../../lib/admin-queries'
import { formatDate, formatQty, todayInLagos } from '../../lib/format'
import { useProducts, useStates } from '../../lib/queries'
import { type ReportArea, type ReportName, type ReportParams, downloadReportCsv, useReport } from '../../lib/report-queries'
import type { User } from '../../lib/types'

const REPORTS: { name: ReportName; label: string; blurb: string; icon: typeof FileText; facilityOnly?: boolean }[] = [
  { name: 'stock-status', label: 'Stock status', blurb: 'On hand, usable and expired stock against each product’s levels', icon: PackageSearch },
  { name: 'reorder', label: 'Reorder', blurb: 'Consumption (AMC), months of stock and quantity to order', icon: ShoppingCart },
  { name: 'expiry', label: 'Expiry', blurb: 'Batches expired or expiring soon, earliest first', icon: CalendarClock },
  { name: 'stock-card', label: 'Stock Card', blurb: 'One facility’s entries for a period, as on the paper card', icon: ClipboardList, facilityOnly: true },
]

const LEVELS = [
  { value: '', label: 'All levels' },
  { value: 'stock_out', label: 'Stock-out' },
  { value: 'low_stock', label: 'At / below EOP' },
  { value: 'reorder', label: 'Below min' },
  { value: 'ok', label: 'OK' },
] as const

const AREA_LABEL: Record<ReportArea, string> = { national: 'All of Nigeria', state: 'A state', lga: 'An LGA', facility: 'One facility' }

/** Area levels this user may report on: their own node and below (the API enforces it). */
function areaLevels(user: User): ReportArea[] {
  switch (user.role) {
    case 'sdp_staff':
      return ['facility']
    case 'lga_officer':
      return ['lga', 'facility']
    case 'state_officer':
      return ['state', 'lga', 'facility']
    default:
      return ['national', 'state', 'lga', 'facility']
  }
}

const firstOfMonth = () => `${todayInLagos().slice(0, 8)}01`

/**
 * Reports (docs/API_CONTRACT.md, "Reports"): pick a report and an area within
 * your own, see it here, print it (the print layout drops the app around it),
 * or download every row as CSV for Excel.
 */
export function ReportsPage({ user }: { user: User }) {
  const levels = areaLevels(user)
  const [report, setReport] = useState<ReportName>('stock-status')
  const [area, setArea] = useState<ReportArea>(levels[0])
  // Officers are fixed to their own state / LGA; others choose.
  const [stateId, setStateId] = useState<number | null>(user.role === 'state_officer' ? user.state_id : null)
  const [lgaId, setLgaId] = useState<number | null>(user.role === 'lga_officer' ? user.lga_id : null)
  const [facilityId, setFacilityId] = useState<number | null>(user.facility_id ?? null)
  const [productId, setProductId] = useState<number | ''>('')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(todayInLagos())
  const [level, setLevel] = useState<(typeof LEVELS)[number]['value']>('')
  const [needsOrder, setNeedsOrder] = useState(false)
  const [withinDays, setWithinDays] = useState(90)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const states = useStates()
  const lgas = useLgas(user.role === 'lga_officer' ? null : stateId)
  const facilities = useLgaFacilities(user.role === 'sdp_staff' ? null : lgaId)
  const products = useProducts()

  const def = REPORTS.find((r) => r.name === report)!
  const effectiveArea: ReportArea = def.facilityOnly ? 'facility' : area
  const store = user.store
  // "facility" can be the officer's own store (id from user.store) or an SDP picked below.
  const [useStore, setUseStore] = useState(false)

  const id =
    effectiveArea === 'national'
      ? undefined
      : effectiveArea === 'state'
        ? stateId
        : effectiveArea === 'lga'
          ? lgaId
          : useStore && store
            ? store.id
            : facilityId
  const ready = effectiveArea === 'national' || id != null

  const params: ReportParams | null = ready
    ? {
        area: effectiveArea,
        id: id ?? undefined,
        product_id: productId || undefined,
        ...(report === 'stock-card' ? { from: from || undefined, to: to || undefined } : {}),
        ...(report === 'stock-status' && level ? { level } : {}),
        ...(report === 'reorder' && needsOrder ? { needs_order: true } : {}),
        ...(report === 'expiry' ? { within_days: withinDays } : {}),
      }
    : null
  const result = useReport(report, params)

  async function download() {
    if (!params) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadReportCsv(report, params)
    } catch (err) {
      setDownloadError((err as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const showState = (effectiveArea === 'state' || effectiveArea === 'lga' || (effectiveArea === 'facility' && !useStore)) && user.role !== 'state_officer' && user.role !== 'lga_officer' && user.role !== 'sdp_staff'
  const showLga = (effectiveArea === 'lga' || (effectiveArea === 'facility' && !useStore)) && user.role !== 'lga_officer' && user.role !== 'sdp_staff'
  const showFacility = effectiveArea === 'facility' && !useStore && user.role !== 'sdp_staff'
  const data = result.data

  return (
    <div className="stack">
      <header className="page-head no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Reports</h1>
          <p className="muted">View, print or download stock reports for your area.</p>
        </div>
      </header>

      <div className="report-picker no-print" role="tablist" aria-label="Report">
        {REPORTS.map((r) => (
          <button
            key={r.name}
            type="button"
            role="tab"
            aria-selected={report === r.name}
            className="report-option"
            onClick={() => setReport(r.name)}
          >
            <r.icon size={20} aria-hidden />
            <span>
              <strong>{r.label}</strong>
              <small>{r.blurb}</small>
            </span>
          </button>
        ))}
      </div>

      <section className="card no-print">
        <div className="filters report-filters">
          {!def.facilityOnly && levels.length > 1 && (
            <label>
              <span>Area</span>
              <select
                value={useStore ? 'store' : area}
                onChange={(e) => {
                  if (e.target.value === 'store') {
                    setUseStore(true)
                    setArea('facility')
                  } else {
                    setUseStore(false)
                    setArea(e.target.value as ReportArea)
                  }
                }}
              >
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l === 'state' && user.role === 'state_officer'
                      ? `${user.node.name} State`
                      : l === 'lga' && user.role === 'lga_officer'
                        ? `${user.node.name} LGA (all facilities)`
                        : AREA_LABEL[l]}
                  </option>
                ))}
                {store && <option value="store">{store.name}</option>}
              </select>
            </label>
          )}
          {def.facilityOnly && store && (
            <label>
              <span>Facility</span>
              <select value={useStore ? 'store' : 'sdp'} onChange={(e) => setUseStore(e.target.value === 'store')}>
                <option value="sdp">A facility</option>
                <option value="store">{store.name}</option>
              </select>
            </label>
          )}
          {showState && (
            <label>
              <span>State</span>
              <select
                value={stateId ?? ''}
                onChange={(e) => {
                  setStateId(e.target.value ? Number(e.target.value) : null)
                  setLgaId(null)
                  setFacilityId(null)
                }}
              >
                <option value="">Choose…</option>
                {states.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showLga && (
            <label>
              <span>LGA</span>
              <select
                value={lgaId ?? ''}
                disabled={!stateId}
                onChange={(e) => {
                  setLgaId(e.target.value ? Number(e.target.value) : null)
                  setFacilityId(null)
                }}
              >
                <option value="">{stateId ? 'Choose…' : 'Choose a state first'}</option>
                {lgas.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showFacility && (
            <label>
              <span>Facility</span>
              <select value={facilityId ?? ''} disabled={!lgaId} onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{lgaId ? 'Choose…' : 'Choose an LGA first'}</option>
                {facilities.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Product</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All products</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {report === 'stock-card' && (
            <>
              <label>
                <span>From</span>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={to} min={from || undefined} max={todayInLagos()} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
          {report === 'stock-status' && (
            <label>
              <span>Level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {report === 'reorder' && (
            <label className="check report-check">
              <input type="checkbox" checked={needsOrder} onChange={(e) => setNeedsOrder(e.target.checked)} />
              <span>Only what needs ordering</span>
            </label>
          )}
          {report === 'expiry' && (
            <label>
              <span>Expiring within</span>
              <select value={withinDays} onChange={(e) => setWithinDays(Number(e.target.value))}>
                {[30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="head-actions" style={{ marginTop: '0.9rem' }}>
          <button type="button" className="btn btn-ghost" disabled={!data || data.rows.length === 0} onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button type="button" className="btn btn-primary" disabled={!params || downloading} onClick={download}>
            <Download size={16} /> {downloading ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        {downloadError && (
          <p className="form-error" role="alert" style={{ marginTop: '0.75rem' }}>
            <AlertCircle size={16} /> {downloadError}
          </p>
        )}
      </section>

      {!params ? (
        <div className="card page-state no-print" style={{ padding: '3rem 1rem' }}>
          <FileText size={28} aria-hidden />
          Choose {effectiveArea === 'facility' ? 'a facility' : effectiveArea === 'lga' ? 'an LGA' : 'a state'} to run the report.
        </div>
      ) : result.isError ? (
        <ErrorState error={result.error} />
      ) : result.isPending ? (
        <Loading />
      ) : (
        data && (
          <section className="card card-flush report-sheet">
            <div className="report-head">
              <div>
                <p className="eyebrow">{data.title} report</p>
                <h2>{data.scope.name}</h2>
                <p className="muted small">
                  {describe(report, params, products.data)} · generated {new Date(data.generated_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })}
                  {result.isFetching ? ' · updating…' : ''}
                </p>
              </div>
              <span className="muted small">
                {formatQty(data.rows.length)} row{data.rows.length === 1 ? '' : 's'}
              </span>
            </div>
            {data.truncated && (
              <p className="report-note no-print">
                Showing the first {formatQty(data.rows.length)} rows. Download the CSV for all of them, or narrow the area or product.
              </p>
            )}
            {data.rows.length === 0 ? (
              <p className="empty">Nothing to report for these choices.</p>
            ) : (
              <ReportTable columns={data.columns} rows={data.rows} />
            )}
          </section>
        )
      )}
    </div>
  )
}

/** The filters in words, for the report header (printed too). */
function describe(report: ReportName, p: ReportParams, products?: { id: number; name: string }[]): string {
  const parts = [p.product_id ? (products?.find((x) => x.id === p.product_id)?.name ?? 'One product') : 'All products']
  if (report === 'stock-card') parts.push(`${p.from ? formatDate(p.from) : 'start'} – ${p.to ? formatDate(p.to) : 'today'}`)
  if (report === 'stock-status' && p.level) parts.push(LEVELS.find((l) => l.value === p.level)?.label ?? p.level)
  if (report === 'reorder' && p.needs_order) parts.push('needing an order')
  if (report === 'expiry') parts.push(`expired or expiring within ${p.within_days} days`)
  return parts.join(' · ')
}

type Cell = string | number | null | undefined

function ReportTable({ columns, rows }: { columns: { key: string; label: string; type: string }[]; rows: Record<string, Cell>[] }) {
  const show = (type: string, v: Cell) => {
    if (v === null || v === undefined || v === '') return '—'
    if (type === 'number' && typeof v === 'number') return v.toLocaleString('en-NG', { maximumFractionDigits: 2 })
    if (type === 'date' && typeof v === 'string') return formatDate(v)
    return v
  }

  return (
    <div className="table-wrap">
      <table className="table report-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.type === 'number' ? 'num' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.type === 'Opening balance' ? 'report-opening' : r.type === 'Physical inventory' ? 'row-count' : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.type === 'number' ? 'num' : c.type === 'date' ? 'nowrap' : undefined}>
                  {show(c.type, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
