import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { api, fieldErrors, unwrap } from '../../lib/api-client'
import { PasswordInput, IconInput } from './AuthInputs'
import { AuthLayout } from './AuthLayout'

/** "Forgot password": ask for a reset link by email. The answer is the same whether or not the account exists. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const send = useMutation({
    mutationFn: async (email: string) => (await unwrap(api.POST('/auth/forgot-password', { body: { email } }))).message,
  })
  const errors = send.error ? fieldErrors(send.error) : {}

  return (
    <AuthLayout>
      {send.isSuccess ? (
        <div className="login-card">
          <h1>Check your email</h1>
          <p className="form-success" role="status">
            <CheckCircle2 size={16} /> {send.data}
          </p>
          <p className="muted small">
            The link works for an hour. Nothing arrived? Check your spam folder, or ask whoever manages your account to
            reset your password.
          </p>
          <Link to="/login" className="btn btn-primary btn-block">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate(email.trim())
          }}
        >
          <h1>Forgot your password?</h1>
          <p className="muted">Enter the email you sign in with and we’ll send you a link to choose a new one.</p>
          <Field label="Email" error={errors.email}>
            <IconInput
              icon={Mail}
              type="email"
              placeholder="you@example.com"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {(errors.form ?? null) && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} /> {errors.form}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="muted small auth-switch">
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

/** Where the reset email's link lands (?token=…&email=…): choose the new password. */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const reset = useMutation({
    mutationFn: async () =>
      (
        await unwrap(
          api.POST('/auth/reset-password', { body: { email, token, password, password_confirmation: confirmation } }),
        )
      ).message,
  })
  const errors = reset.error ? fieldErrors(reset.error) : {}
  const linkProblem =
    errors.token ?? errors.email ?? (!token || !email ? 'This link is incomplete. Ask for a new one.' : null)

  return (
    <AuthLayout>
      {reset.isSuccess ? (
        <div className="login-card">
          <h1>Password changed</h1>
          <p className="form-success" role="status">
            <CheckCircle2 size={16} /> {reset.data}
          </p>
          <p className="muted small">You’ve been signed out on every device, including the mobile app.</p>
          <Link to="/login" className="btn btn-primary btn-block">
            Sign in
          </Link>
        </div>
      ) : (
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault()
            reset.mutate()
          }}
        >
          <h1>Choose a new password</h1>
          <p className="muted">
            For <strong>{email || 'your account'}</strong>. At least 8 characters.
          </p>
          <Field label="New password" error={errors.password}>
            <PasswordInput
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Repeat it">
            <PasswordInput
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          {linkProblem && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} /> {linkProblem} <Link to="/forgot-password">Get a new link</Link>
            </p>
          )}
          {errors.form && (
            <p className="form-error" role="alert">
              <AlertCircle size={16} /> {errors.form}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={reset.isPending || !token || !email || password.length < 8 || password !== confirmation}
          >
            {reset.isPending ? 'Saving…' : 'Change password'}
          </button>
          {password && confirmation && password !== confirmation && (
            <p className="muted small">The two passwords differ.</p>
          )}
        </form>
      )}
    </AuthLayout>
  )
}
