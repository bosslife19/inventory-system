import { ArrowLeft, CheckCheck, MessagesSquare, RotateCcw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { ChatThread } from '../../components/support/ChatThread'
import { ROLE_LABEL, timeAgo } from '../../lib/format'
import {
  useMarkConversationRead,
  useReplyToSupport,
  useSetConversationStatus,
  useSupportConversations,
  useSupportConversationThread,
  type SupportConversation,
} from '../../lib/support'

/**
 * The owner's support inbox: every organization's conversations, newest
 * message first, with the open one beside the list (stacked on phones).
 * The open thread polls every few seconds; the list every 15.
 */
export function SupportPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('c') ? Number(params.get('c')) : null
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const list = useSupportConversations({ status, q })
  const rows = list.data?.data ?? []
  const current = rows.find((c) => c.id === selected) ?? null

  const select = (id: number | null) => setParams(id ? { c: String(id) } : {}, { replace: true })

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Support</h1>
          <p className="muted">
            Chats from every organization’s people. Replies reach them on the web and as a push on their phone.
          </p>
        </div>
      </header>

      <div className={`inbox${selected ? ' inbox-has-thread' : ''}`}>
        <section className="card card-flush inbox-list">
          <div className="inbox-tools">
            <div className="segmented" role="group" aria-label="Status">
              {(['open', 'closed'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s === 'open' ? 'Open' : 'Closed'}
                </button>
              ))}
            </div>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault()
                setQ(draft.trim())
              }}
            >
              <Search size={16} />
              <input
                type="search"
                placeholder="Name, email or organization…"
                aria-label="Search conversations"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (!e.target.value) setQ('')
                }}
              />
            </form>
          </div>
          {list.isPending ? (
            <Loading />
          ) : list.isError ? (
            <ErrorState error={list.error} />
          ) : rows.length === 0 ? (
            <p className="empty">
              {q
                ? 'No conversations match.'
                : status === 'open'
                  ? 'No open conversations — all caught up.'
                  : 'No closed conversations.'}
            </p>
          ) : (
            <ul className="inbox-rows">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`inbox-row${c.id === selected ? ' active' : ''}`}
                    onClick={() => select(c.id)}
                  >
                    <span className="inbox-row-top">
                      <strong>{c.user.name}</strong>
                      <span className="muted small">{timeAgo(c.last_message_at)}</span>
                    </span>
                    <span className="muted small">
                      {c.organization.name} · {ROLE_LABEL[c.user.role]}
                    </span>
                    <span className="inbox-preview">
                      {c.last_message_from_support && <span className="muted">You: </span>}
                      {c.last_message_preview}
                    </span>
                    {c.unread_count > 0 && <span className="nav-count inbox-count">{c.unread_count}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-flush inbox-thread">
          {selected === null ? (
            <div className="inbox-placeholder muted">
              <MessagesSquare size={28} />
              <p>Choose a conversation.</p>
            </div>
          ) : (
            <Conversation key={selected} id={selected} conversation={current} onBack={() => select(null)} />
          )}
        </section>
      </div>
    </div>
  )
}

function Conversation({
  id,
  conversation: c,
  onBack,
}: {
  id: number
  conversation: SupportConversation | null
  onBack: () => void
}) {
  const thread = useSupportConversationThread(id)
  const reply = useReplyToSupport(id)
  const markRead = useMarkConversationRead()
  const setStatus = useSetConversationStatus()
  const fromUser = thread.data?.messages.filter((m) => !m.from_support).length ?? 0

  // Viewing the thread reads it — on opening, and as new messages arrive.
  const markReadNow = markRead.mutate
  useEffect(() => {
    if (fromUser > 0) markReadNow(id)
  }, [id, fromUser, markReadNow])

  return (
    <>
      <header className="inbox-thread-head">
        <button type="button" className="btn btn-icon inbox-back" aria-label="Back to conversations" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{c?.user.name ?? 'Conversation'}</strong>
          {c && (
            <div className="muted small">
              {c.user.email} · {ROLE_LABEL[c.user.role]} · {c.user.place.join(' › ')}
            </div>
          )}
          {c && (
            <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              {c.organization.name}{' '}
              <span className={`badge ${c.organization.plan === 'paid' ? 'badge-ok' : 'badge-neutral'}`}>
                {c.organization.plan === 'paid' ? 'Paid' : 'Free'}
              </span>
            </div>
          )}
        </div>
        {c &&
          (c.status === 'open' ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id, status: 'closed' })}
            >
              <CheckCheck size={15} /> Close
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id, status: 'open' })}
            >
              <RotateCcw size={15} /> Reopen
            </button>
          ))}
      </header>
      {thread.isError ? (
        <ErrorState error={thread.error} />
      ) : (
        <ChatThread
          messages={thread.data?.messages ?? []}
          loading={thread.isPending}
          mine={(m) => m.from_support}
          otherName={() => c?.user.name ?? 'Them'}
          send={reply}
          placeholder={`Reply to ${c?.user.name.split(' ')[0] ?? 'them'}…`}
          empty={<p className="muted">No messages.</p>}
        />
      )}
    </>
  )
}
