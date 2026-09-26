import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { useStates } from '../../lib/queries'

const ZONE_LABEL: Record<string, string> = {
  north_central: 'North Central',
  north_east: 'North East',
  north_west: 'North West',
  south_east: 'South East',
  south_south: 'South South',
  south_west: 'South West',
}

/** National level. The Federal rollup is Phase 3; for now, drill down by state. */
export function FederalPage() {
  const states = useStates()

  if (states.isPending) return <Loading />
  if (states.isError) return <ErrorState error={states.error} />

  const byZone = Object.entries(ZONE_LABEL).map(([zone, label]) => ({
    label,
    states: states.data.filter((s) => s.geopolitical_zone === zone),
  }))

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Nigeria</h1>
          <p className="muted">National rollup arrives in Phase 3 — choose a state to drill down.</p>
        </div>
      </header>
      <div className="zone-grid">
        {byZone.map((z) => (
          <section key={z.label} className="card">
            <h2>{z.label}</h2>
            <ul className="link-list">
              {z.states.map((s) => (
                <li key={s.id}>
                  <Link to={`/states/${s.id}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
