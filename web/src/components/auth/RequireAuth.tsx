import { Navigate, useLocation } from 'react-router-dom'
import { useMe } from '../../lib/auth'
import { useAuthStore } from '../../lib/auth-store'
import { UserContext } from '../../lib/user-context'
import { ErrorState, Loading } from '../layout/PageState'

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

  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>
}
