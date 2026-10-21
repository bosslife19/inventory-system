import { Building, LogOut, Menu, Palette } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useLogout } from '../../lib/auth'
import { ROLE_LABEL } from '../../lib/format'
import type { User } from '../../lib/types'
import { Brand } from './Brand'

/**
 * The platform owner's console: the same shell as everyone else's, with
 * organizations and the platform's branding in place of the Stock Card
 * screens — the owner sees no organization's data.
 */
export function OwnerShell({ user }: { user: User }) {
  const logout = useLogout()
  const [navOpen, setNavOpen] = useState(false)
  const close = () => setNavOpen(false)

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <Link to="/owner" className="brand" onClick={close}>
          <Brand tagline="Owner console" />
        </Link>

        <div className="nav-label">Platform</div>
        <nav className="nav">
          <NavLink to="/owner" end onClick={close}>
            <Building size={18} /> <span className="nav-text">Organizations</span>
          </NavLink>
          <NavLink to="/owner/platform" onClick={close}>
            <Palette size={18} /> <span className="nav-text">Your branding</span>
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <Link to="/account" className="user-chip" onClick={close} title="Your account and password">
            <span className="avatar" aria-hidden>
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="nav-text">
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
          </Link>
          <button type="button" className="btn btn-sm btn-signout" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut size={16} /> <span className="nav-text">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={close} aria-hidden />

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-icon menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu size={20} />
          </button>
          <nav className="crumbs" aria-label="Where you are">
            <strong>Owner console</strong>
          </nav>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
