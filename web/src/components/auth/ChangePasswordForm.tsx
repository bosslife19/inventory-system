import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useChangePassword } from '../../lib/admin-queries'
import { fieldErrors } from '../../lib/api-client'
import { Field } from '../form/Field'

/**
 * Change your own password. With `temporary`, it's the forced step after
 * signing in with a password someone else set — the API allows nothing else
 * until it's done.
 */
export function ChangePasswordForm({ temporary = false, onDone }: { temporary?: boolean; onDone?: () => void }) {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!current) found.current_password = temporary ? 'Enter the temporary password you were given.' : 'Enter your current password.'
    if (next.length < 8) found.password = 'At least 8 characters.'
    else if (next === current) found.password = 'Choose a password different from the current one.'
    if (confirm !== next) found.password_confirmation = 'The two passwords don’t match.'
    setErrors(found)
    if (Object.keys(found).length) return

    change.mutate(
      { current_password: current, password: next, password_confirmation: confirm },
      {
        onSuccess: () => {
          setDone(true)
          setCurrent('')
          setNext('')
          setConfirm('')
          onDone?.()
        },
        onError: (err) => setErrors(fieldErrors(err)),
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <Field label={temporary ? 'Temporary password' : 'Current password'} error={errors.current_password}>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters" error={errors.password}>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm new password" error={errors.password_confirmation}>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>

      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form}
        </p>
      )}
      {done && !temporary && (
        <p className="form-success" role="status">
          <CheckCircle2 size={16} /> Password changed. Your other devices have been signed out.
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={change.isPending}>
        <KeyRound size={16} /> {change.isPending ? 'Saving…' : temporary ? 'Set my password' : 'Change password'}
      </button>
    </form>
  )
}
