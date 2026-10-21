import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { LockedRollup } from '../../components/rollup/LockedRollup'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { StorePanel } from '../../components/rollup/StorePanel'
import { useLgas } from '../../lib/admin-queries'
import { ZONE_LABEL } from '../../lib/format'
import { hasFeature } from '../../lib/plan'
import { useStateActivity, useStateSummary, useStates } from '../../lib/queries'
import type { User } from '../../lib/types'

/** State rollup: every LGA in the state, worst first, plus consolidated per-product needs. */
export function StatePage({ stateId, user }: { stateId: number; user: User }) {
  return hasFeature(user, 'rollups') ? <StateRollup stateId={stateId} user={user} /> : <StateFree stateId={stateId} user={user} />
}

/** Free plan: the state's LGAs to open, and the officer's own store. */
function StateFree({ stateId, user }: { stateId: number; user: User }) {
  const lgas = useLgas(stateId)
  const name = useStates().data?.find((s) => s.id === stateId)?.name

  if (lgas.isError) return <ErrorState error={lgas.error} />

  return (
    <LockedRollup
      back={
        user.role !== 'state_officer' && (
          <Link to="/federal" className="back-link">
            <ArrowLeft size={15} /> Nigeria
          </Link>
        )
      }
      eyebrow="State overview"
      title={name ? `${name} State` : 'State'}
      user={user}
      ownNode={user.state_id === stateId}
      childNoun="LGAs"
      children={lgas.data?.map((l) => ({ id: l.id, name: l.name, href: `/lgas/${l.id}` }))}
    />
  )
}

function StateRollup({ stateId, user }: { stateId: number; user: User }) {
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
      store={<StorePanel store={s.node.store} user={user} />}
      summary={s}
      activity={activity}
      childNoun="LGAs"
      childSingular="LGA"
      hrefFor={(row) => `/lgas/${row.id}`}
    />
  )
}
