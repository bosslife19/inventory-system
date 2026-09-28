import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { useLgaActivity, useLgaSummary } from '../../lib/queries'
import type { User } from '../../lib/types'

/** LGA rollup: every facility in the LGA, worst first, plus consolidated per-product needs. */
export function LgaPage({ lgaId, user }: { lgaId: number; user: User }) {
  const summary = useLgaSummary(lgaId)
  const activity = useLgaActivity(lgaId)

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} />

  const s = summary.data
  const canGoUp = user.role === 'state_officer' || user.role === 'federal_officer' || user.role === 'admin'

  return (
    <RollupDashboard
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
      summary={s}
      activity={activity}
      childNoun="Facilities"
      childSingular="Facility"
      hrefFor={(row) => `/facilities/${row.id}`}
    />
  )
}
