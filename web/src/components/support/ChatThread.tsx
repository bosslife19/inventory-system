import { AlertCircle, SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SupportMessage } from '../../lib/support'

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
})
const dayKey = (iso: string | null) => (iso ? dayFmt.format(new Date(iso)) : '')

interface Props {
  messages: SupportMessage[]
  /** Whose side a message is on: true = shown as "mine" (right, blue). */
  mine: (m: SupportMessage) => boolean
  /** Name shown above the other side's messages. */
  otherName: (m: SupportMessage) => string
  send: UseMutationResult<SupportMessage, Error, string>
  empty: React.ReactNode
  placeholder?: string
  loading?: boolean
}

/**
 * A support conversation: bubbles grouped by day, newest at the bottom, and a
 * composer (Enter sends, Shift+Enter starts a new line). Shared by the
 * account's chat widget and the owner's inbox.
 */
export function ChatThread({
  messages,
  mine,
  otherName,
  send,
  empty,
  placeholder = 'Write a message…',
  loading,
}: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)?.id

  // Keep the newest message in view as messages arrive.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last])

  function submit() {
    const body = draft.trim()
    if (!body || send.isPending) return
    send.mutate(body, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} aria-live="polite">
        {loading ? (
          <p className="chat-empty muted">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="chat-empty">{empty}</div>
        ) : (
          messages.map((m, i) => {
            const own = mine(m)
            const newDay = i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at)
            const sameSide = i > 0 && !newDay && mine(messages[i - 1]) === own
            return (
              <div key={m.id}>
                {newDay && <div className="chat-day">{dayKey(m.created_at)}</div>}
                <div className={`chat-row${own ? ' chat-row-mine' : ''}`}>
                  {!own && !sameSide && <span className="chat-name">{otherName(m)}</span>}
                  <div className={`chat-bubble${own ? ' chat-bubble-mine' : ''}`}>
                    {m.body}
                    <span className="chat-time">{m.created_at ? timeFmt.format(new Date(m.created_at)) : ''}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {send.isError && (
        <p className="form-error chat-error" role="alert">
          <AlertCircle size={15} /> {send.error.message}
        </p>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          maxLength={2000}
          aria-label="Message"
        />
        <button
          type="submit"
          className="btn btn-primary btn-icon"
          aria-label="Send"
          disabled={!draft.trim() || send.isPending}
        >
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  )
}
