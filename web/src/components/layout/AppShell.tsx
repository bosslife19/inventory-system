import { Bell, Building2, ChevronRight, ClipboardList, CreditCard, FileText, Gauge, History, LayoutDashboard, ListChecks, LogOut, Menu, Package, PanelLeftClose, PanelLeftOpen, Truck, UserCog, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { homePath, manageableRoles, useLogout } from '../../lib/auth'
import { useAlertCount, useDeliveryNoteCount, useReorderRequests } from '../../lib/queries'
import { AlertBadge } from '../alerts/AlertBadge'
import { Brand, PartnerBadge } from './Brand'
import { RenewalBanner } from './RenewalBanner'
import { ROLE_LABEL } from '../../lib/format'
import type { User } from '../../lib/types'

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})

// Desktop: the sidebar can shrink to an icon rail; remembered per browser.
const COLLAPSED_KEY = 'sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppShell({ user }: { user: User }) {
  const logout = useLogout()
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const openAlerts = useAlertCount({ status: 'open' }).data ?? 0
  // Deliveries waiting to be signed for where this user records: own facility or own store.
  const ownFacilityId = user.facility_id ?? user.store?.id ?? null
  const pendingDeliveries = useDeliveryNoteCount(ownFacilityId ?? 0, 'draft', ownFacilityId !== null).data ?? 0
  // Officers: requests waiting for their store to answer.
  const waitingRequests =
    useReorderRequests(user.store?.id ?? 0, 'incoming', 'pending', 1, 1, user.store != null).data?.meta.pagination.total ?? 0
  const deliveryCount = pendingDeliveries > 0 && <span className="nav-count">{pendingDeliveries > 99 ? '99+' : pendingDeliveries}</span>
  const home = homePath(user)
  const close = () => setNavOpen(false)
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Private window or blocked storage: it just won't be remembered.
    }
  }

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}${collapsed ? ' nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <Link to={home} className="brand" onClick={close}>
          <Brand />
        </Link>
        {user.organization && <PartnerBadge organization={user.organization} />}

        <div className="nav-label">Workspace</div>
        <nav className="nav">
          <NavLink to={home} end onClick={close}>
            <LayoutDashboard size={18} /> <span className="nav-text">Dashboard</span>
          </NavLink>
          {user.role === 'sdp_staff' && (
            <a href={`${home}#history`} onClick={close}>
              <History size={18} /> <span className="nav-text">Inventory history</span>
            </a>
          )}
          {user.role === 'sdp_staff' && (
            <NavLink to="/delivery-notes" onClick={close}>
              <Truck size={18} /> <span className="nav-text">Delivery notes</span>
              {deliveryCount}
            </NavLink>
          )}
          {user.store && (
            <NavLink to={`/facilities/${user.store.id}`} end onClick={close}>
              <Warehouse size={18} /> <span className="nav-text">My store</span>
            </NavLink>
          )}
          {user.store && (
            <NavLink to={`/facilities/${user.store.id}/delivery-notes`} onClick={close}>
              <Truck size={18} /> <span className="nav-text">Delivery notes</span>
              {deliveryCount}
            </NavLink>
          )}
          {ownFacilityId !== null && (
            <a href={user.store ? `/facilities/${user.store.id}#requests` : `${home}#my-requests`} onClick={close}>
              <ClipboardList size={18} /> <span className="nav-text">Reorder requests</span>
              {waitingRequests > 0 && <span className="nav-count">{waitingRequests > 99 ? '99+' : waitingRequests}</span>}
            </a>
          )}
          {ownFacilityId !== null && (
            <NavLink to="/levels" onClick={close}>
              <Gauge size={18} /> <span className="nav-text">Stock levels</span>
            </NavLink>
          )}
          <NavLink to="/products" onClick={close}>
            <Package size={18} /> <span className="nav-text">Products</span>
          </NavLink>
          <NavLink to="/reports" onClick={close}>
            <FileText size={18} /> <span className="nav-text">Reports</span>
          </NavLink>
          <NavLink to="/activity" onClick={close}>
            <ListChecks size={18} /> <span className="nav-text">Activity log</span>
          </NavLink>
          <NavLink to="/alerts" onClick={close}>
            <Bell size={18} /> <span className="nav-text">Alerts</span>
            {openAlerts > 0 && <span className="nav-count">{openAlerts > 99 ? '99+' : openAlerts}</span>}
          </NavLink>
        </nav>

        {(manageableRoles(user).length > 0 || user.role === 'admin') && (
          <>
            <div className="nav-label">Administration</div>
            <nav className="nav" aria-label="Administration">
              {manageableRoles(user).length > 0 && (
                <NavLink to="/admin/users" onClick={close}>
                  <UserCog size={18} /> <span className="nav-text">Accounts</span>
                </NavLink>
              )}
              {user.role === 'admin' && (
                <NavLink to="/admin/facilities" onClick={close}>
                  <Building2 size={18} /> <span className="nav-text">Facilities</span>
                </NavLink>
              )}
              {user.role === 'admin' && (
                <NavLink to="/billing" onClick={close}>
                  <CreditCard size={18} /> <span className="nav-text">Billing</span>
                </NavLink>
              )}
            </nav>
          </>
        )}


        <div className="sidebar-foot">
          <Link to="/account" className="user-chip" onClick={close} title="Your account and password">
            <span className="avatar" aria-hidden>
              {initials(user.name)}
            </span>
            <span className="nav-text">
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-signout"
            title={collapsed ? 'Sign out' : undefined}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
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
          <button
            type="button"
            className="btn btn-icon collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
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
          {user.organization && <RenewalBanner organization={user.organization} />}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
