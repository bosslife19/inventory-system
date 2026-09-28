import { ArrowLeft, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityChart } from '../../components/charts/ActivityChart'
import { FacilityFlagsChart } from '../../components/charts/FacilityFlagsChart'
import { ReorderNeedsChart } from '../../components/charts/ReorderNeedsChart'
import { StatusDonut, type DonutSlice } from '../../components/charts/StatusDonut'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { DrillDownTable } from '../../components/rollup/DrillDownTable'
import { ProductRollupTable } from '../../components/rollup/ProductRollupTable'
import { RollupSummaryCard } from '../../components/rollup/RollupSummaryCard'
import { formatDate } from '../../lib/format'
import { useLgaActivity, useLgaSummary } from '../../lib/queries'
import type { FacilityStockSummary, User } from '../../lib/types'

/** Each facility's worst state, for the status breakdown (display-only grouping of server flags). */
function facilityStatus(rows: FacilityStockSummary[]): DonutSlice[] {
  const tally = { stock_out: 0, low_stock: 0, reorder: 0, ok: 0 }
  for (const r of rows) {
    if (r.flag_counts.stock_out > 0) tally.stock_out++
    else if (r.flag_counts.low_stock > 0) tally.low_stock++
    else if (r.needs_reorder_count > 0 || r.flag_counts.expired > 0) tally.reorder++
    else tally.ok++
  }
  return [
    { key: 'stock_out', label: 'Has a stock-out', value: tally.stock_out, color: 'var(--status-critical)' },
    { key: 'low_stock', label: 'Low stock', value: tally.low_stock, color: 'var(--status-warning)' },
    { key: 'reorder', label: 'Needs reorder / expired', value: tally.reorder, color: 'var(--status-notice)' },
    { key: 'ok', label: 'All OK', value: tally.ok, color: 'var(--status-ok)' },
  ]
}

/** LGA rollup: overview tiles and charts, every facility worst first, and consolidated per-product needs. */
export function LgaPage({ lgaId, user }: { lgaId: number; user: User }) {
  const summary = useLgaSummary(lgaId)
  const activity = useLgaActivity(lgaId)
  const [query, setQuery] = useState('')

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} />

  const s = summary.data
  const canGoUp = user.role === 'state_officer' || user.role === 'federal_officer' || user.role === 'admin'
  const slices = facilityStatus(s.children)
  const healthy = slices.find((x) => x.key === 'ok')!.value
  const q = query.trim().toLowerCase()
  const facilities = q ? s.children.filter((c) => c.name.toLowerCase().includes(q)) : s.children

  return (
    <div className="stack">
      <RollupSummaryCard
        back={
          canGoUp && (
            <Link to={`/states/${s.node.parent.id}`} className="back-link">
              <ArrowLeft size={15} /> {s.node.parent.name} State
            </Link>
          )
        }
        eyebrow="LGA overview"
        title={`${s.node.name} LGA`}
        subtitle={`${s.node.parent.name} State · live rollup, refreshes every minute${summary.isFetching ? ' · updating…' : ''}`}
        childCount={s.child_count}
        childNoun="Facilities"
        counts={s.facility_counts}
      />

      <div className="grid-chart">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Recording activity</h2>
              <p>
                Stock Card entries per week across all facilities
                {activity.data?.last_transaction_date && ` · last entry ${formatDate(activity.data.last_transaction_date)}`}
              </p>
            </div>
          </div>
          {activity.isError ? (
            <ErrorState error={activity.error} />
          ) : activity.isPending ? (
            <div className="chart-box chart-empty">Loading…</div>
          ) : (
            <ActivityChart weeks={activity.data.weeks} />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Facility status</h2>
              <p>Each facility counted once, by its most serious issue</p>
            </div>
          </div>
          <StatusDonut
            slices={slices}
            centerValue={`${s.child_count ? Math.round((healthy / s.child_count) * 100) : 0}%`}
            centerLabel="all OK"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Facilities with the most flags</h2>
              <p>Flagged products per facility</p>
            </div>
          </div>
          <FacilityFlagsChart rows={s.children} />
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Reorder needs by product</h2>
              <p>Facilities at or below the reorder level (EOP)</p>
            </div>
          </div>
          <ReorderNeedsChart rows={s.products} childNoun="Facilities" />
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Facilities, worst first</h2>
            <p>Open a facility to see its full Stock Card</p>
          </div>
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search facilities…"
              aria-label="Search facilities"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <DrillDownTable rows={facilities} childNoun="Facility" hrefFor={(row) => `/facilities/${row.id}`} />
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Products across the LGA</h2>
            <p>Consolidated usable stock and how many facilities are short</p>
          </div>
        </div>
        <ProductRollupTable rows={s.products} childNoun="Facilities" />
      </section>
    </div>
  )
}
