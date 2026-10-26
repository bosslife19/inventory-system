import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../lib/auth-store'
import { LoginHero } from './LoginPage'

const RESULT: Record<string, { ok: boolean; title: string; text: string }> = {
  verified: { ok: true, title: 'Email confirmed', text: 'Thanks — your email address is confirmed. You can carry on setting up.' },
  already: { ok: true, title: 'Already confirmed', text: 'This email address was confirmed already. You’re all set.' },
  expired: {
    ok: false,
    title: 'This link has expired',
    text: 'Sign in and choose “Send the link again” to get a new one.',
  },
  invalid: {
    ok: false,
    title: 'This link doesn’t work',
    text: 'It may have been copied incompletely. Sign in and choose “Send the link again” to get a new one.',
  },
}

/**
 * Where the link in the confirmation email lands (the API confirms the
 * address, then redirects here with ?status=…). Works whether or not this
 * browser is signed in; the phone app picks it up on its next check.
 */
export function EmailVerifiedPage() {
  const status = useSearchParams()[0].get('status') ?? 'invalid'
  const result = RESULT[status] ?? RESULT.invalid
  const signedIn = useAuthStore((s) => s.token) !== null
  const queryClient = useQueryClient()

  // A signed-in tab would still hold the unconfirmed user.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [queryClient])

  return (
    <div className="login">
      <LoginHero />
      <div className="login-panel">
        <div className="login-card">
          <span className="store-icon" aria-hidden style={{ marginBottom: '0.75rem' }}>
            {result.ok ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          </span>
          <h1>{result.title}</h1>
          <p className="muted">{result.text}</p>
          <p className="muted small">Using the mobile app? Go back to it and tap “I’ve confirmed it”.</p>
          <Link to={signedIn ? '/' : '/login'} className="btn btn-primary btn-block" style={{ marginTop: '1rem' }}>
            {signedIn ? 'Continue' : 'Sign in'}
          </Link>
        </div>
      </div>
    </div>
  )
}
