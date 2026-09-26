import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { ApiError } from '../../lib/api-client'
import { homePath, useLogin, useMe } from '../../lib/auth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const me = useMe()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from

  if (me.data) return <Navigate to={from ?? homePath(me.data)} replace />

  const error = login.error instanceof ApiError ? (login.error.errors.email?.[0] ?? login.error.message) : null

  return (
    <div className="login">
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate({ email, password }, { onSuccess: ({ user }) => navigate(from ?? homePath(user), { replace: true }) })
        }}
      >
        <h1>Stock Card</h1>
        <p className="muted">Sign in to record and review facility stock.</p>

        <Field label="Email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>

        {import.meta.env.DEV && (
          <p className="muted small">
            Demo accounts (password <code>password</code>): sdp1@demo.test, lga@demo.test, state@demo.test,
            federal@demo.test, admin@demo.test
          </p>
        )}
      </form>
    </div>
  )
}
