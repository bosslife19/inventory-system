import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { Brand } from '../../components/layout/Brand'
import { ApiError } from '../../lib/api-client'
import { homePath, useLogin, useMe } from '../../lib/auth'

const POINTS = [
  'Digital Stock Card for every facility',
  'Live LGA, State and Federal rollups',
  'Stock-out and expiry flags, worst first',
]

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
      <LoginHero />

      <div className="login-panel">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault()
            login.mutate({ email, password }, { onSuccess: ({ user }) => navigate(from ?? homePath(user), { replace: true }) })
          }}
        >
          <h1>Welcome back</h1>
          <p className="muted">Sign in to record and review stock.</p>

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
              <AlertCircle size={16} />
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="muted small auth-switch">
            New here? <Link to="/signup">Create an account for your organization</Link>
          </p>

          {import.meta.env.DEV && (
            <p className="muted small demo">
              Demo accounts (password <code>password</code>): sdp1@demo.test, lga@demo.test, state@demo.test,
              federal@demo.test, admin@demo.test
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

/** The left-hand panel of the sign-in and sign-up screens. */
export function LoginHero() {
  return (
    <aside className="login-hero">
      <div className="brand">
        <Brand />
      </div>
      <div>
        <h2>Health commodity visibility, from facility to federal.</h2>
        <p>Record receipts, issues and counts at the facility, and see stock health roll up across Nigeria.</p>
        <ul className="login-points">
          {POINTS.map((p) => (
            <li key={p}>
              <CheckCircle2 size={18} /> {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="login-foot">National health supply chain inventory · Nigeria</div>
    </aside>
  )
}
