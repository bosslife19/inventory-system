import { ErrorState, Loading } from '../../components/layout/PageState'
import { LockedRollup } from '../../components/rollup/LockedRollup'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { StorePanel } from '../../components/rollup/StorePanel'
import { hasFeature } from '../../lib/plan'
import { useFederalActivity, useFederalSummary, useStates } from '../../lib/queries'
import type { User } from '../../lib/types'

/** National rollup: every state, worst first, plus consolidated per-product needs. */
export function FederalPage({ user }: { user: User }) {
  return hasFeature(user, 'rollups') ? <FederalRollup user={user} /> : <FederalFree user={user} />
}

/** Free plan: the states to open, and the national store for federal officers. */
function FederalFree({ user }: { user: User }) {
  const states = useStates()

  if (states.isError) return <ErrorState error={states.error} />

  return (
    <LockedRollup
      eyebrow="National overview"
      title="Nigeria"
      user={user}
      ownNode={user.role === 'federal_officer'}
      childNoun="States"
      children={states.data?.map((s) => ({ id: s.id, name: s.name, href: `/states/${s.id}` }))}
    />
  )
}

function FederalRollup({ user }: { user: User }) {
  const summary = useFederalSummary()
  const activity = useFederalActivity()

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} />

  return (
    <RollupDashboard
      eyebrow="National overview"
      title="Nigeria"
      subtitle={`All states and the FCT · refreshes every minute${summary.isFetching ? ' · updating…' : ''}`}
      store={<StorePanel store={summary.data.node.store} user={user} />}
      summary={summary.data}
      activity={activity}
      childNoun="States"
      childSingular="State"
      hrefFor={(row) => `/states/${row.id}`}
    />
  )
}
