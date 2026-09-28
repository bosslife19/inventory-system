import { Bell, Boxes, ChevronRight, FileText, History, LayoutDashboard, LogOut, Menu, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { homePath, useLogout } from '../../lib/auth'
import { useAlertCount } from '../../lib/queries'
import { AlertBadge } from '../alerts/AlertBadge'
import { ROLE_LABEL } from '../../lib/format'
import type { User } from '../../lib/types'

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Upcoming roadmap areas, shown so the navigation reads as the whole product. */
const SOON = [
  { label: 'Delivery notes', icon: ScanLine },
  { label: 'Reports', icon: FileText },
]

export function AppShell({ user }: { user: User }) {
  const logout = useLogout()
  const [navOpen, setNavOpen] = useState(false)
  const openAlerts = useAlertCount({ status: 'open' }).data ?? 0
  const home = homePath(user)
  const close = () => setNavOpen(false)

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <Link to={home} className="brand" onClick={close}>
          <span className="brand-mark" aria-hidden>
            <Boxes size={18} />
          </span>
          <span>
            Stock Card
            <small>Health supply chain · Nigeria</small>
          </span>
        </Link>

        <div className="nav-label">Workspace</div>
        <nav className="nav">
          <NavLink to={home} end onClick={close}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          {user.role === 'sdp_staff' && (
            <a href={`${home}#history`} onClick={close}>
              <History size={18} /> Stock card history
            </a>
          )}
          <NavLink to="/alerts" onClick={close}>
            <Bell size={18} /> Alerts
            {openAlerts > 0 && <span className="nav-count">{openAlerts > 99 ? '99+' : openAlerts}</span>}
          </NavLink>
        </nav>

        <div className="nav-label">Coming soon</div>
        <nav className="nav" aria-label="Coming soon">
          {SOON.map(({ label, icon: Icon }) => (
            <a key={label} aria-disabled="true" style={{ opacity: 0.5, cursor: 'default' }}>
              <Icon size={18} /> {label}
            </a>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar" aria-hidden>
              {initials(user.name)}
            </span>
            <span>
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-signout"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={close} aria-hidden />

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-icon menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu size={20} />
          </button>
          <nav className="crumbs" aria-label="Your area">
            {user.node.path.map((part, i) => (
              <span key={i} className="crumbs">
                {i > 0 && <ChevronRight size={14} aria-hidden />}
                {i === user.node.path.length - 1 ? <strong>{part}</strong> : part}
              </span>
            ))}
          </nav>
          <span className="topbar-date">{today.format(new Date())}</span>
          <AlertBadge />
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
