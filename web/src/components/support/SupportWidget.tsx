import { LifeBuoy, MessageCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMarkSupportRead, useMySupportThread, useMySupportUnread, useSendSupportMessage } from '../../lib/support'
import { ChatThread } from './ChatThread'

/**
 * Live chat with the platform's support team, for every organization
 * account: a floating button (with unread replies) that opens a chat panel.
 * The open panel polls every few seconds; closed, only the badge polls.
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false)
  const unread = useMySupportUnread().data ?? 0
  const thread = useMySupportThread(open)
  const send = useSendSupportMessage()
  const markRead = useMarkSupportRead()
  const replies = thread.data?.messages.filter((m) => m.from_support).length ?? 0

  // Reading the panel marks replies read — when it opens, and as new ones arrive while open.
  const markReadNow = markRead.mutate
  useEffect(() => {
    if (open && (unread > 0 || replies > 0)) markReadNow()
  }, [open, unread, replies, markReadNow])

  return (
    <>
      {open && (
        <section className="support-panel" role="dialog" aria-label="Support chat">
          <header className="support-head">
            <span className="support-icon" aria-hidden>
              <LifeBuoy size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <strong>Support</strong>
              <small>We usually reply within a few hours</small>
            </div>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Close support chat"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <ChatThread
            messages={thread.data?.messages ?? []}
            loading={thread.isPending}
            mine={(m) => !m.from_support}
            otherName={() => 'Support'}
            send={send}
            empty={
              <>
                <strong>How can we help?</strong>
                <p className="muted small">
                  Ask about recording stock, reports, accounts or your plan. Replies also reach the mobile app.
                </p>
              </>
            }
          />
        </section>
      )}
      <button
        type="button"
        className="support-fab"
        aria-label={unread ? `Support chat, ${unread} unread` : open ? 'Close support chat' : 'Open support chat'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unread > 0 && <span className="support-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
    </>
  )
}
