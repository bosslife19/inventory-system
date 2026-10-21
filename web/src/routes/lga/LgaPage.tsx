import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { LockedRollup } from '../../components/rollup/LockedRollup'
import { RollupDashboard } from '../../components/rollup/RollupDashboard'
import { StorePanel } from '../../components/rollup/StorePanel'
import { useLgaFacilities } from '../../lib/admin-queries'
import { hasFeature } from '../../lib/plan'
import { useLgaActivity, useLgaSummary } from '../../lib/queries'
import type { User } from '../../lib/types'

/** LGA rollup: every facility in the LGA, worst first, plus consolidated per-product needs. */
export function LgaPage({ lgaId, user }: { lgaId: number; user: User }) {
  return hasFeature(user, 'rollups') ? <LgaRollup lgaId={lgaId} user={user} /> : <LgaFree lgaId={lgaId} user={user} />
}

/** Free plan: the LGA's facilities to open, and the officer's own store. */
function LgaFree({ lgaId, user }: { lgaId: number; user: User }) {
  const facilities = useLgaFacilities(lgaId)
  const own = user.lga_id === lgaId
  const name = own ? user.node.name : facilities.data?.[0]?.lga?.name

  if (facilities.isError) return <ErrorState error={facilities.error} />

  return (
    <LockedRollup
      eyebrow="LGA overview"
      title={name ? `${name} LGA` : 'LGA'}
      user={user}
      ownNode={own}
      childNoun="Facilities"
      children={facilities.data?.map((f) => ({ id: f.id, name: f.name, href: `/facilities/${f.id}` }))}
    />
  )
}

function LgaRollup({ lgaId, user }: { lgaId: number; user: User }) {
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
      store={<StorePanel store={s.node.store} user={user} />}
      summary={s}
      activity={activity}
      childNoun="Facilities"
      childSingular="Facility"
      hrefFor={(row) => `/facilities/${row.id}`}
    />
  )
}
