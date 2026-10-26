import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '../../lib/auth'
import { useAuthStore } from '../../lib/auth-store'
import { UserContext } from '../../lib/user-context'
import { ErrorState, Loading } from '../layout/PageState'
import { SetPasswordScreen } from './SetPasswordScreen'
import { VerifyEmailScreen } from './VerifyEmailScreen'

/** Resolves the signed-in user (GET /auth/me) for everything below it, or sends them to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const signedOut = useAuthStore((s) => s.signedOut)
  const me = useMe()
  const location = useLocation()

  // Remember where to come back to — unless the user deliberately signed out.
  if (!token) return <Navigate to="/login" replace state={signedOut ? null : { from: location.pathname }} />
  if (me.isPending) return <Loading label="Signing in…" />
  if (me.isError) return <ErrorState error={me.error} />
  // A temporary password has to be replaced before anything else works (the API enforces it too).
  if (me.data.must_change_password) return <SetPasswordScreen user={me.data} />
  // After signing up: the email has to be confirmed first (the API enforces it too).
  if (!me.data.email_verified) return <VerifyEmailScreen user={me.data} />

  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>
}
