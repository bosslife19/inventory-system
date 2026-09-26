import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { useStateLgas, useStates } from '../../lib/queries'
import type { User } from '../../lib/types'

/**
 * State level. The State rollup (aggregates + worst-first LGAs) is Phase 3;
 * until then this is the drill-down entry point into each LGA's rollup.
 */
export function StatePage({ stateId, user }: { stateId: number; user: User }) {
  const lgas = useStateLgas(stateId)
  const states = useStates()
  const name = states.data?.find((s) => s.id === stateId)?.name

  if (lgas.isPending) return <Loading />
  if (lgas.isError) return <ErrorState error={lgas.error} />

  return (
    <div className="stack">
      {user.role !== 'state_officer' && (
        <Link to="/federal" className="back-link">
          ← All states
        </Link>
      )}
      <header className="page-head">
        <div>
          <h1>{name ? `${name} State` : 'State'}</h1>
          <p className="muted">
            {lgas.data.length} LGAs · state-wide rollup arrives in Phase 3 — open an LGA for its facilities.
          </p>
        </div>
      </header>
      <section className="card">
        <ul className="link-grid">
          {lgas.data.map((lga) => (
            <li key={lga.id}>
              <Link to={`/lgas/${lga.id}`}>{lga.name}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
