import { AlertCircle, ClipboardList, Send, X } from 'lucide-react'
import { useState } from 'react'
import { quantityWithUnit, timeAgo } from '../../lib/format'
import { useAnswerReorderRequest, useReorderRequests, useStockBalances } from '../../lib/queries'
import type { ReorderRequest, ReorderRequestStatus } from '../../lib/types'
import { DispatchForm } from '../dispatches/DispatchForm'
import { Field } from '../form/Field'
import { Loading } from '../layout/PageState'
import { Modal } from '../ui/Modal'

const STATUS: Record<ReorderRequestStatus, { label: string; tone: string }> = {
  pending: { label: 'Waiting', tone: 'notice' },
  fulfilled: { label: 'Sent', tone: 'ok' },
  rejected: { label: 'Declined', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

interface Props {
  facilityId: number
  /** incoming = asked of this store; outgoing = made by this facility. */
  direction: 'incoming' | 'outgoing'
  /** May answer (incoming) or cancel (outgoing): keeps this Stock Card. */
  canAct: boolean
  /** Hide the whole card when there is nothing to show. */
  hideWhenEmpty?: boolean
}

/**
 * Reorder requests on a dashboard. A store sees what facilities below have
 * asked of it and fulfils each by sending the stock (a dispatch the
 * requester confirms) or declines it; a facility sees what it asked for
 * and where each request stands.
 */
export function ReorderRequestList({ facilityId, direction, canAct, hideWhenEmpty }: Props) {
  const [page, setPage] = useState(1)
  const requests = useReorderRequests(facilityId, direction, undefined, page, 8)
  const pending = useReorderRequests(facilityId, direction, 'pending', 1, 1)
  const [fulfilling, setFulfilling] = useState<ReorderRequest | null>(null)
  const [answering, setAnswering] = useState<{ request: ReorderRequest; action: 'reject' | 'cancel' } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const rows = requests.data?.data ?? []
  const pagination = requests.data?.meta.pagination
  const waiting = pending.data?.meta.pagination.total ?? 0
  if (hideWhenEmpty && !requests.isPending && (pagination?.total ?? 0) === 0) return null
  const incoming = direction === 'incoming'

  return (
    <section className="card card-flush" id={incoming ? 'requests' : 'my-requests'}>
      <div className="card-head">
        <div className="store-title">
          <span className={`store-icon${incoming && waiting ? ' is-warning' : ''}`} aria-hidden>
            <ClipboardList size={20} />
          </span>
          <div>
            <h2>{incoming ? 'Reorder requests to this store' : 'Reorder requests sent'}</h2>
            <p>
              {incoming
                ? waiting
                  ? `${waiting} waiting for ${canAct ? 'you' : 'the store'} to send or decline`
                  : 'Facilities below ask this store for stock here'
                : waiting
                  ? `${waiting} waiting for an answer`
                  : 'What this facility has asked the stores above for'}
            </p>
          </div>
        </div>
      </div>

      {flash && (
        <p className="form-success" role="status" style={{ margin: '0 1.25rem 0.75rem' }}>
          {flash}
        </p>
      )}

      {requests.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="empty">{incoming ? 'No requests yet.' : 'No requests sent yet.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{incoming ? 'From' : 'Asked'}</th>
                <th>Products</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status]
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-title">{incoming ? r.facility.name : r.supplier.name}</div>
                      <div className="muted small">
                        <span className="mono">{r.number}</span> · {timeAgo(r.created_at)} · {r.requested_by_name}
                      </div>
                      {r.comments && <div className="muted small">“{r.comments}”</div>}
                    </td>
                    <td className="small">
                      {r.items.map((i) => (
                        <div key={i.id}>
                          {i.product.name}: {quantityWithUnit(i.quantity_requested, i.product.unit_of_measure)}
                          {i.quantity_supplied !== null && i.quantity_supplied !== i.quantity_requested && (
                            <span className="muted"> · {i.quantity_supplied === 0 ? 'none sent' : `${quantityWithUnit(i.quantity_supplied, i.product.unit_of_measure)} sent`}</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`badge badge-${st.tone}`}>{st.label}</span>
                      {r.delivery_note && (
                        <div className="muted small">
                          {r.delivery_note.delivery_note_no} · {r.delivery_note.status === 'draft' ? 'awaiting receipt' : r.delivery_note.status}
                        </div>
                      )}
                      {r.status === 'rejected' && r.response_note && <div className="muted small">“{r.response_note}”</div>}
                    </td>
                    <td className="actions">
                      {canAct && r.status === 'pending' && incoming && (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setFulfilling(r)}>
                            <Send size={14} /> Send stock
                          </button>{' '}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnswering({ request: r, action: 'reject' })}>
                            Decline
                          </button>
                        </>
                      )}
                      {canAct && r.status === 'pending' && !incoming && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnswering({ request: r, action: 'cancel' })}>
                          <X size={14} /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.last_page > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="muted">
            Page {pagination.current_page} of {pagination.last_page}
          </span>
          <button type="button" className="btn btn-ghost" disabled={page >= pagination.last_page} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </nav>
      )}

      <Modal
        open={fulfilling !== null}
        onClose={() => setFulfilling(null)}
        size="lg"
        title={fulfilling ? `Send stock for ${fulfilling.number}` : ''}
        description={fulfilling ? `To ${fulfilling.facility.name}` : undefined}
        icon={<Send size={20} />}
      >
        {fulfilling && (
          <FulfilForm
            request={fulfilling}
            onCancel={() => setFulfilling(null)}
            onDone={(r) => {
              setFulfilling(null)
              setFlash(`${r.number} sent to ${r.facility.name} as ${r.delivery_note?.delivery_note_no}. It reaches their Stock Card when they confirm it.`)
            }}
          />
        )}
      </Modal>

      <Modal
        open={answering !== null}
        onClose={() => setAnswering(null)}
        title={answering?.action === 'reject' ? `Decline ${answering.request.number}?` : `Cancel ${answering?.request.number}?`}
        icon={<X size={20} />}
      >
        {answering && <AnswerForm {...answering} onDone={() => setAnswering(null)} />}
      </Modal>
    </section>
  )
}

/** The dispatch form, started from the request and the store's own stock. */
function FulfilForm({ request, onDone, onCancel }: { request: ReorderRequest; onDone: (r: ReorderRequest) => void; onCancel: () => void }) {
  const stock = useStockBalances(request.supplier.id)
  if (stock.isPending) return <Loading />
  if (stock.isError) return <p className="form-error">{stock.error.message}</p>
  return <DispatchForm facilityId={request.supplier.id} stock={stock.data} request={request} onDone={() => undefined} onFulfilled={onDone} onCancel={onCancel} />
}

function AnswerForm({ request, action, onDone }: { request: ReorderRequest; action: 'reject' | 'cancel'; onDone: () => void }) {
  const answer = useAnswerReorderRequest()
  const [reason, setReason] = useState('')
  const reject = action === 'reject'

  return (
    <form
      className="stack"
      style={{ gap: '0.9rem' }}
      onSubmit={(e) => {
        e.preventDefault()
        answer.mutate({ id: request.id, action, reason: reason.trim() }, { onSuccess: onDone })
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        {reject ? `${request.facility.name} will be told, with your reason, and can ask another store.` : `${request.supplier.name} will no longer see it as waiting.`}
      </p>
      {reject && (
        <Field label="Reason (optional)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock here — ask the State store" autoFocus />
        </Field>
      )}
      {answer.isError && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {answer.error.message}
        </p>
      )}
      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Keep it
        </button>
        <button type="submit" className="btn btn-danger" disabled={answer.isPending}>
          {reject ? 'Decline request' : 'Cancel request'}
        </button>
      </div>
    </form>
  )
}
