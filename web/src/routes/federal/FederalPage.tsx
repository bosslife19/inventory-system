import { ErrorState, Loading } from '../../components/layout/PageState'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { StorePanel } from '../../components/rollup/StorePanel'
import { useFederalActivity, useFederalSummary } from '../../lib/queries'
import type { User } from '../../lib/types'

/** National rollup: every state, worst first, plus consolidated per-product needs. */
export function FederalPage({ user }: { user: User }) {
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
