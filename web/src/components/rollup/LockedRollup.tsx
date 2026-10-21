import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { User } from '../../lib/types'
import { LockedCard } from '../plan/Paid'
import { StorePanel } from './StorePanel'

interface Props {
  eyebrow: string
  title: string
  back?: React.ReactNode
  /** The places one level down, to open their own pages (free on every plan). */
  children: { id: number; name: string; href: string }[] | undefined
  childNoun: string
  user: User
  /** Show the officer's own store when this is their own node. */
  ownNode: boolean
}

/**
 * An LGA / State / Federal page on the free plan: the officer's own store
 * still works, and the places below can still be opened, but the rollup
 * figures are part of the paid plan.
 */
export function LockedRollup({ eyebrow, title, back, children, childNoun, user, ownNode }: Props) {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          {back}
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </header>

      {ownNode && user.store && <StorePanel store={user.store} user={user} />}

      <LockedCard feature="rollups" title="Rollup dashboard" />

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>{childNoun}</h2>
            <p>Open one to see its own page</p>
          </div>
        </div>
        {children === undefined ? (
          <p className="empty">Loading…</p>
        ) : children.length === 0 ? (
          <p className="empty">None yet.</p>
        ) : (
          <ul className="link-list">
            {children.map((c) => (
              <li key={c.id}>
                <Link to={c.href}>
                  {c.name} <ChevronRight size={15} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
