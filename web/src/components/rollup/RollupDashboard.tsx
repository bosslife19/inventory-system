import type { UseQueryResult } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { facilityStatusSlices } from '../../lib/chart-theme'
import { formatDate } from '../../lib/format'
import type { AreaStockSummary, FacilityStockSummary, RollupSummary, StockActivity } from '../../lib/types'
import { ActivityChart } from '../charts/ActivityChart'
import { FacilityFlagsChart } from '../charts/FacilityFlagsChart'
import { ReorderNeedsChart } from '../charts/ReorderNeedsChart'
import { StatusDonut } from '../charts/StatusDonut'
import { ErrorState } from '../layout/PageState'
import { DrillDownTable } from './DrillDownTable'
import { ProductRollupTable } from './ProductRollupTable'
import { RollupSummaryCard } from './RollupSummaryCard'

type Row = FacilityStockSummary | AreaStockSummary

interface Props {
  eyebrow: string
  title: string
  subtitle: string
  back?: React.ReactNode
  summary: RollupSummary
  activity: UseQueryResult<StockActivity>
  /** Plural, e.g. "Facilities", "LGAs", "States". */
  childNoun: string
  /** Singular, for the table heading. */
  childSingular: string
  hrefFor: (row: Row) => string
}

/**
 * The whole rollup dashboard — tiles, charts, worst-first drill-down and
 * per-product totals — shared by the LGA, State and Federal pages
 * (web/CLAUDE.md rule 2). Only the children differ by level.
 */
export function RollupDashboard({ eyebrow, title, subtitle, back, summary: s, activity, childNoun, childSingular, hrefFor }: Props) {
  const [query, setQuery] = useState('')
  const areas = childNoun !== 'Facilities'
  // 'LGA' stays upper-case mid-sentence; 'State' doesn't.
  const singular = childSingular === 'LGA' ? childSingular : childSingular.toLowerCase()
  const q = query.trim().toLowerCase()
  const children = (q ? (s.children as Row[]).filter((c) => c.name.toLowerCase().includes(q)) : s.children) as Row[]
  const healthy = s.facility_status.ok
  const withData = s.facility_count - s.facility_status.no_data

  return (
    <div className="stack">
      <RollupSummaryCard
        back={back}
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        childCount={s.child_count}
        childNoun={childNoun}
        facilityCount={s.facility_count}
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
            slices={facilityStatusSlices(s.facility_status)}
            centerValue={`${withData ? Math.round((healthy / withData) * 100) : 0}%`}
            centerLabel="all OK"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{areas ? `${childNoun} with the most flagged facilities` : 'Facilities with the most flags'}</h2>
              <p>{areas ? `Facilities flagged per ${singular}` : 'Flagged products per facility'}</p>
            </div>
          </div>
          <FacilityFlagsChart rows={s.children} empty={areas ? `No flagged facilities in any ${singular}.` : undefined} />
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
            <h2>{childNoun}, worst first</h2>
            <p>{areas ? `Open a ${singular} to drill down` : 'Open a facility to see its full Stock Card'}</p>
          </div>
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              placeholder={`Search ${childNoun.toLowerCase()}…`}
              aria-label={`Search ${childNoun.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <DrillDownTable rows={children} childNoun={childSingular} hrefFor={hrefFor} />
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Products across {title}</h2>
            <p>Consolidated usable stock and how many facilities are short</p>
          </div>
        </div>
        <ProductRollupTable rows={s.products} childNoun="Facilities" />
      </section>
    </div>
  )
}
