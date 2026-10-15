import { Send } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatQty } from '../../lib/format'
import { useDispatches } from '../../lib/queries'
import type { DeliveryNote, DeliveryNoteStatus } from '../../lib/types'
import { ErrorState, Loading } from '../layout/PageState'
import { Modal } from '../ui/Modal'
import { DeliveryNoteDetail } from '../delivery-notes/DeliveryNoteDetail'

/** The receiver's delivery-note status, read from the sender's side. */
const OUTGOING: Record<DeliveryNoteStatus, { label: string; tone: string }> = {
  draft: { label: 'Awaiting receipt', tone: 'warning' },
  confirmed: { label: 'Received', tone: 'ok' },
  rejected: { label: 'Returned', tone: 'neutral' },
}

export function DispatchStatusBadge({ status }: { status: DeliveryNoteStatus }) {
  return <span className={`badge badge-${OUTGOING[status].tone}`}>{OUTGOING[status].label}</span>
}

const TABS: { value: DeliveryNoteStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Awaiting receipt' },
  { value: 'confirmed', label: 'Received' },
  { value: 'rejected', label: 'Returned' },
]

/** "AL ×40, ORS ×100 +2 more" */
function summarize(n: DeliveryNote): string {
  const parts = n.items.slice(0, 2).map((i) => `${i.product.sku} ×${formatQty(i.quantity)}`)
  return n.items.length > 2 ? `${parts.join(', ')} +${n.items.length - 2} more` : parts.join(', ')
}

/** Stock a store has issued down the chain, and whether each receiver has signed for it yet. */
export function DispatchList({ facilityId }: { facilityId: number }) {
  const [status, setStatus] = useState<DeliveryNoteStatus | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const dispatches = useDispatches(facilityId, status, page)

  const rows = dispatches.data?.data ?? []
  const open = rows.find((n) => n.id === openId) ?? null
  const pagination = dispatches.data?.meta.pagination

  return (
    <section className="card card-flush">
      <div className="card-head">
        <div>
          <h2>Issued to facilities</h2>
          <p>Already off this Stock Card · lands on the receiver’s once they confirm{dispatches.isFetching ? ' · updating…' : ''}</p>
        </div>
        <div className="segmented" role="group" aria-label="Status">
          {TABS.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={status === t.value}
              onClick={() => {
                setStatus(t.value)
                setPage(1)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {dispatches.isError ? (
        <ErrorState error={dispatches.error} />
      ) : dispatches.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="page-state" style={{ padding: '2.5rem 1rem' }}>
          <Send size={26} aria-hidden />
          {status ? 'Nothing here.' : 'Nothing issued to facilities yet.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Issued</th>
                <th>To</th>
                <th className="hide-sm">Voucher</th>
                <th>Lines</th>
                <th>Status</th>
                <th className="hide-sm">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="row-link" onClick={() => setOpenId(n.id)}>
                  <td className="nowrap">{formatDate(n.dispatched_date)}</td>
                  <td>
                    <button type="button" className="link-button cell-title" onClick={() => setOpenId(n.id)}>
                      {n.facility.name}
                    </button>
                  </td>
                  <td className="hide-sm mono">{n.delivery_note_no ?? '—'}</td>
                  <td>
                    <strong>{n.items.length}</strong>
                    <div className="muted small line-summary">{summarize(n)}</div>
                  </td>
                  <td>
                    <DispatchStatusBadge status={n.status} />
                  </td>
                  <td className="hide-sm nowrap small">{n.status === 'confirmed' ? formatDate(n.received_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.last_page > 1 && (
        <nav className="pager" aria-label="Pages" style={{ padding: '0 1.25rem 1.1rem' }}>
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="muted">
            Page {pagination.current_page} of {pagination.last_page} · {formatQty(pagination.total)} issued
          </span>
          <button type="button" className="btn btn-ghost" disabled={page >= pagination.last_page} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </nav>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open ? `Issued to ${open.facility.name}` : 'Dispatch'}
        description={open ? `${formatDate(open.dispatched_date)}${open.delivery_note_no ? ` · ${open.delivery_note_no}` : ''}` : undefined}
        icon={<Send size={20} />}
      >
        {open && <DeliveryNoteDetail note={open} facilityId={open.facility_id} canAct={false} onDone={() => setOpenId(null)} />}
      </Modal>
    </section>
  )
}
