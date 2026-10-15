import { LogOut, ShieldCheck } from 'lucide-react'
import { useLogout } from '../../lib/auth'
import type { User } from '../../lib/types'
import { ChangePasswordForm } from './ChangePasswordForm'

/**
 * Shown instead of the app while the account is on a temporary password —
 * one someone else set when creating or resetting it. The API refuses
 * everything else until it's changed.
 */
export function SetPasswordScreen({ user }: { user: User }) {
  const logout = useLogout()

  return (
    <div className="login login-single">
      <div className="login-panel">
        <div className="login-card">
          <span className="store-icon" aria-hidden style={{ marginBottom: '0.75rem' }}>
            <ShieldCheck size={20} />
          </span>
          <h1>Set your password</h1>
          <p className="muted">
            Welcome, {user.name}. You signed in with a temporary password — choose your own to continue. Only you should know it.
          </p>
          <ChangePasswordForm temporary />
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginTop: '0.75rem' }}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
