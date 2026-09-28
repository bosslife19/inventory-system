import { ArrowLeft, ChevronRight, Info, Map as MapIcon, MapPinned, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { KpiTile } from '../../components/ui/KpiTile'
import { ZONE_LABEL } from '../../lib/format'
import { useStateLgas, useStates } from '../../lib/queries'
import type { User } from '../../lib/types'

/**
 * State level. The State rollup (aggregates + worst-first LGAs) is Phase 3;
 * until then this is the drill-down entry point into each LGA's rollup.
 */
export function StatePage({ stateId, user }: { stateId: number; user: User }) {
  const lgas = useStateLgas(stateId)
  const states = useStates()
  const [query, setQuery] = useState('')
  const state = states.data?.find((s) => s.id === stateId)

  if (lgas.isPending) return <Loading />
  if (lgas.isError) return <ErrorState error={lgas.error} />

  const q = query.trim().toLowerCase()
  const shown = q ? lgas.data.filter((l) => l.name.toLowerCase().includes(q)) : lgas.data

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          {user.role !== 'state_officer' && (
            <Link to="/federal" className="back-link">
              <ArrowLeft size={15} /> All states
            </Link>
          )}
          <p className="eyebrow">State overview</p>
          <h1>{state ? `${state.name} State` : 'State'}</h1>
          {state && <p className="muted">{ZONE_LABEL[state.geopolitical_zone] ?? state.geopolitical_zone} zone</p>}
        </div>
      </header>

      <div className="kpi-grid">
        <KpiTile tone="primary" icon={MapPinned} label="Local government areas" value={lgas.data.length} sub="Open one for its facilities" />
        <KpiTile tone="dark" icon={MapIcon} label="Geopolitical zone" value={state ? (ZONE_LABEL[state.geopolitical_zone] ?? '—') : '—'} />
      </div>

      <div className="callout">
        <Info size={18} />
        <span>
          State-wide stock charts and worst-first LGA ranking arrive with the State rollup (roadmap Phase 3). For now, open
          an LGA to see its facilities, charts and reorder needs.
        </span>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>LGAs</h2>
            <p>{shown.length} of {lgas.data.length} shown</p>
          </div>
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search LGAs…"
              aria-label="Search LGAs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="empty">No LGA matches “{query}”.</p>
        ) : (
          <ul className="tile-grid">
            {shown.map((lga) => (
              <li key={lga.id}>
                <Link to={`/lgas/${lga.id}`}>
                  {lga.name}
                  <ChevronRight size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
