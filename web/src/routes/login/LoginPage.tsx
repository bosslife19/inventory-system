import { AlertCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { ApiError } from '../../lib/api-client'
import { homePath, useLogin, useMe } from '../../lib/auth'
import { IconInput, PasswordInput } from './AuthInputs'
import { AuthLayout } from './AuthLayout'

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
    <AuthLayout>
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate(
            { email, password },
            { onSuccess: ({ user }) => navigate(from ?? homePath(user), { replace: true }) },
          )
        }}
      >
        <h1>Welcome back</h1>
        <p className="muted">Sign in to record and review stock.</p>

        <Field label="Email">
          <IconInput
            icon={Mail}
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="small forgot-link">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>

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
    </AuthLayout>
  )
}
