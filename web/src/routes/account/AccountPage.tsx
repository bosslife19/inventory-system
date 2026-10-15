import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm'
import { ROLE_LABEL } from '../../lib/format'
import type { User } from '../../lib/types'

/** Your own account: who you are signed in as, and changing your password. */
export function AccountPage({ user }: { user: User }) {
  return (
    <div className="stack" style={{ maxWidth: '34rem' }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{user.name}</h1>
          <p className="muted">
            {ROLE_LABEL[user.role]} · {user.node.path.join(' › ')} · {user.email}
          </p>
        </div>
      </header>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Change password</h2>
            <p>Your other devices are signed out when you change it.</p>
          </div>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  )
}
