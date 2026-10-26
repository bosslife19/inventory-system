import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, LogOut, MailCheck, RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import { useLogout, useResendVerification } from '../../lib/auth'
import type { User } from '../../lib/types'

/**
 * Shown instead of the app after signing up, until the email address is
 * confirmed with the link sent to it. The API refuses everything else
 * meanwhile (403 email_verification_required).
 */
export function VerifyEmailScreen({ user }: { user: User }) {
  const logout = useLogout()
  const resend = useResendVerification()
  const queryClient = useQueryClient()
  const [checking, setChecking] = useState(false)
  const [notYet, setNotYet] = useState(false)

  // Confirmed in another tab or on the phone: fetch /auth/me again.
  async function check() {
    setChecking(true)
    setNotYet(false)
    await queryClient.refetchQueries({ queryKey: ['me'] })
    setChecking(false)
    setNotYet(true) // only still visible if it wasn't confirmed yet
  }

  return (
    <div className="login login-single">
      <div className="login-panel">
        <div className="login-card">
          <span className="store-icon" aria-hidden style={{ marginBottom: '0.75rem' }}>
            <MailCheck size={20} />
          </span>
          <h1>Confirm your email</h1>
          <p className="muted">
            Welcome, {user.name}. We’ve sent a link to <strong>{user.email}</strong>. Open it to confirm your address, then come back
            here. Check your spam folder if you can’t see it.
          </p>

          {resend.isSuccess && (
            <p className="form-success" role="status">
              <CheckCircle2 size={16} /> {resend.data.message}
            </p>
          )}
          {resend.isError && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} />{' '}
              {resend.error.message.includes('Too Many') ? 'You’ve asked a few times already. Wait a few minutes and try again.' : resend.error.message}
            </p>
          )}
          {notYet && !checking && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} /> Not confirmed yet. Open the link in the email, then try again.
            </p>
          )}

          <div className="stack" style={{ gap: '0.6rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary btn-block" onClick={check} disabled={checking}>
              <RefreshCw size={16} /> {checking ? 'Checking…' : 'I’ve confirmed it — continue'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => resend.mutate()} disabled={resend.isPending}>
              <Send size={16} /> {resend.isPending ? 'Sending…' : 'Send the link again'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
