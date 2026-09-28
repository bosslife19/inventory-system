import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { ZONE_LABEL } from '../../lib/format'
import { useStateActivity, useStateSummary, useStates } from '../../lib/queries'
import type { User } from '../../lib/types'

/** State rollup: every LGA in the state, worst first, plus consolidated per-product needs. */
export function StatePage({ stateId, user }: { stateId: number; user: User }) {
  const summary = useStateSummary(stateId)
  const activity = useStateActivity(stateId)
  const zone = useStates().data?.find((s) => s.id === stateId)?.geopolitical_zone

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} />

  const s = summary.data

  return (
    <RollupDashboard
      back={
        user.role !== 'state_officer' && (
          <Link to="/federal" className="back-link">
            <ArrowLeft size={15} /> Nigeria
          </Link>
        )
      }
      eyebrow="State overview"
      title={`${s.node.name} State`}
      subtitle={`${zone ? `${ZONE_LABEL[zone] ?? zone} zone · ` : ''}refreshes every minute${summary.isFetching ? ' · updating…' : ''}`}
      summary={s}
      activity={activity}
      childNoun="LGAs"
      childSingular="LGA"
      hrefFor={(row) => `/lgas/${row.id}`}
    />
  )
}
