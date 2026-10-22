import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { ApiError } from '../../lib/api-client'
import { homePath, type SignUp, useMe, useRegister } from '../../lib/auth'
import { LoginHero } from './LoginPage'

const EMPTY: SignUp = {
  organization_name: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  password_confirmation: '',
}

/** Self sign-up: a new organization on the free plan; the platform owner upgrades it once paid. */
export function SignupPage() {
  const [form, setForm] = useState(EMPTY)
  const register = useRegister()
  const me = useMe()
  const navigate = useNavigate()

  if (me.data) return <Navigate to={homePath(me.data)} replace />

  const set = (key: keyof SignUp) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value })
  const errors = register.error instanceof ApiError ? register.error.errors : {}
  const fieldError = (key: keyof SignUp) => errors[key]?.[0]
  const error = register.error && !Object.keys(errors).length ? register.error.message : null

  return (
    <div className="login">
      <LoginHero />

      <div className="login-panel">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault()
            register.mutate(form, {
              onSuccess: ({ user }) => navigate(homePath(user), { replace: true }),
            })
          }}
        >
          <h1>Create an account</h1>
          <p className="muted">
            Set up your organization on the free plan: Stock Cards, alerts and reports. You'll be its admin and can add
            your facilities and staff.
          </p>

          <Field label="Organization" error={fieldError('organization_name')}>
            <input required maxLength={255} value={form.organization_name} onChange={set('organization_name')} />
          </Field>
          <Field label="Your name" error={fieldError('name')}>
            <input autoComplete="name" required maxLength={255} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Email" error={fieldError('email')}>
            <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone (optional)" error={fieldError('phone')}>
            <input type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Password" hint="At least 8 characters" error={fieldError('password')}>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password_confirmation}
              onChange={set('password_confirmation')}
            />
          </Field>

          {error && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} />
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={register.isPending}>
            {register.isPending ? 'Creating your account…' : 'Create account'}
          </button>

          <p className="muted small auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
