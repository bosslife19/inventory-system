import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import type { User } from '../../lib/types'

/**
 * A temporary password, shown once (the API never returns it again). The
 * person signs in with it and must choose their own straight away.
 */
export function TemporaryPassword({ user, password, onClose }: { user: User; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Email: ${user.email}\nTemporary password: ${password}`)
      setCopied(true)
    } catch {
      // Clipboard blocked (e.g. not HTTPS): the password is on screen to copy by hand.
    }
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <p style={{ margin: 0 }}>
        Give these to <strong>{user.name}</strong>. They’ll be asked to choose their own password when they first sign in.
      </p>
      <dl className="credentials">
        <div>
          <dt>Email</dt>
          <dd className="mono">{user.email}</dd>
        </div>
        <div>
          <dt>Temporary password</dt>
          <dd className="mono credentials-secret">{password}</dd>
        </div>
      </dl>
      <p className="muted small" style={{ margin: 0 }}>
        <KeyRound size={13} style={{ verticalAlign: '-2px' }} /> This is the only time it’s shown. If it’s lost, reset the password again.
      </p>
      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
