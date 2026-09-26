import { Link, Outlet } from 'react-router-dom'
import { homePath, useLogout } from '../../lib/auth'
import { ROLE_LABEL } from '../../lib/format'
import type { User } from '../../lib/types'

export function AppShell({ user }: { user: User }) {
  const logout = useLogout()
  const signOut = () => logout.mutate()

  return (
    <div className="shell">
      <header className="topbar">
        <Link to={homePath(user)} className="brand">
          <span className="brand-mark" aria-hidden>
            ▦
          </span>
          Stock Card
        </Link>
        <div className="topbar-node" title={user.node.path.join(' › ')}>
          {user.node.path.join(' › ')}
        </div>
        <div className="topbar-user">
          <span>
            {user.name}
            <small>{ROLE_LABEL[user.role]}</small>
          </span>
          <button type="button" className="btn btn-ghost" onClick={signOut} disabled={logout.isPending}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
