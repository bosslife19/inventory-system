import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { DrillDownTable } from '../../components/rollup/DrillDownTable'
import { ProductRollupTable } from '../../components/rollup/ProductRollupTable'
import { RollupSummaryCard } from '../../components/rollup/RollupSummaryCard'
import { useLgaSummary } from '../../lib/queries'
import type { User } from '../../lib/types'

/** LGA rollup: every facility in the LGA, worst first, plus consolidated per-product needs. */
export function LgaPage({ lgaId, user }: { lgaId: number; user: User }) {
  const summary = useLgaSummary(lgaId)

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} />

  const s = summary.data
  const canGoUp = user.role === 'state_officer' || user.role === 'federal_officer' || user.role === 'admin'

  return (
    <div className="stack">
      {canGoUp && (
        <Link to={`/states/${s.node.parent.id}`} className="back-link">
          ← {s.node.parent.name} State
        </Link>
      )}
      <RollupSummaryCard
        title={`${s.node.name} LGA`}
        subtitle={`${s.node.parent.name} State · refreshes every minute`}
        childCount={s.child_count}
        childNoun="Facilities"
        counts={s.facility_counts}
      />

      <section className="card">
        <div className="card-head">
          <h2>Facilities, worst first</h2>
          {summary.isFetching && <span className="muted small">Updating…</span>}
        </div>
        <DrillDownTable rows={s.children} childNoun="Facility" hrefFor={(row) => `/facilities/${row.id}`} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Products across the LGA</h2>
        </div>
        <ProductRollupTable rows={s.products} childNoun="Facilities" />
      </section>
    </div>
  )
}
