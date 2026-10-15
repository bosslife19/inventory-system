import { AlertCircle, Check, X } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDate, formatQty, todayInLagos } from '../../lib/format'
import { useDeliveryNoteAction } from '../../lib/queries'
import type { DeliveryNote } from '../../lib/types'
import { Field } from '../form/Field'
import { CaptureBadge, DeliveryStatusBadge } from './DeliveryNoteBadges'

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—')

/**
 * One delivery note. Drafts can be confirmed — posting every line as a
 * receipt, all or nothing — or rejected, by those who can record at the
 * facility (the API is the real gate). A dispatch from another store is
 * confirmed with the date it actually arrived; rejecting one sends the
 * stock back onto the sender's card.
 */
export function DeliveryNoteDetail({ note, facilityId, canAct, onDone }: { note: DeliveryNote; facilityId: number; canAct: boolean; onDone: () => void }) {
  const act = useDeliveryNoteAction(facilityId)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const dispatched = note.source_facility !== null
  const [arrived, setArrived] = useState(() => (dispatched ? todayInLagos() : note.received_date))
  const error =
    act.error instanceof ApiError ? Object.values(act.error.errors).flat().join(' ') || act.error.message : act.error?.message

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <dl className="meta-grid">
        <div>
          <dt>Status</dt>
          <dd>
            <DeliveryStatusBadge status={note.status} /> <CaptureBadge note={note} />
          </dd>
        </div>
        {dispatched && (
          <div>
            <dt>Issued</dt>
            <dd>{formatDate(note.dispatched_date)}</dd>
          </div>
        )}
        {(!dispatched || note.status === 'confirmed') && (
          <div>
            <dt>Received</dt>
            <dd>{formatDate(note.received_date)}</dd>
          </div>
        )}
        <div>
          <dt>From</dt>
          <dd>{note.source}</dd>
        </div>
        {dispatched && (
          <div>
            <dt>To</dt>
            <dd>{note.facility.name}</dd>
          </div>
        )}
        <div>
          <dt>Note no.</dt>
          <dd className="mono">{note.delivery_note_no ?? '—'}</dd>
        </div>
        <div>
          <dt>Entered by</dt>
          <dd>
            {note.created_by_name} · {when(note.created_at)}
          </dd>
        </div>
        {note.status === 'confirmed' && (
          <div>
            <dt>Confirmed by</dt>
            <dd>
              {note.confirmed_by_name} · {when(note.confirmed_at)}
            </dd>
          </div>
        )}
        {note.status === 'rejected' && (
          <div>
            <dt>Rejected by</dt>
            <dd>
              {note.rejected_by_name} · {when(note.rejected_at)}
              {note.rejection_reason && <div className="muted small">“{note.rejection_reason}”</div>}
            </dd>
          </div>
        )}
      </dl>

      <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th className="num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((item, i) => (
              <tr key={item.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  <div className="cell-title">{item.product.name}</div>
                  <div className="muted small">{item.product.sku}</div>
                </td>
                <td className="mono">{item.batch_no ?? '—'}</td>
                <td className="nowrap">{item.expiry_date ? formatDate(item.expiry_date) : '—'}</td>
                <td className="num">
                  {formatQty(item.quantity)} <span className="muted small">{item.product.unit_of_measure}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note.comments && <p className="muted small" style={{ margin: 0 }}>{note.comments}</p>}

      {error && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} />
          {error}
        </p>
      )}

      {canAct && note.status === 'draft' && (
        <>
          {rejecting && (
            <Field label="Why is it rejected? (optional)">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong facility on the note" />
            </Field>
          )}
          {!rejecting && dispatched && (
            <Field label="Date it arrived" hint="The receipts are dated this">
              <input
                type="date"
                value={arrived}
                min={note.dispatched_date ?? undefined}
                max={todayInLagos()}
                onChange={(e) => setArrived(e.target.value)}
                style={{ maxWidth: '14rem' }}
              />
            </Field>
          )}
          <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
            {rejecting ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ id: note.id, action: 'reject', reason: reason.trim() || undefined }, { onSuccess: onDone })}
                >
                  <X size={16} /> Reject note
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setRejecting(true)}>
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ id: note.id, action: 'confirm', receivedDate: dispatched ? arrived : undefined }, { onSuccess: onDone })
                  }
                >
                  <Check size={16} /> {act.isPending ? 'Posting…' : `Confirm receipt of ${note.items.length} line${note.items.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
          <p className="muted small" style={{ margin: 0, textAlign: 'right' }}>
            {rejecting
              ? dispatched
                ? `Rejecting returns every line to ${note.source}’s Stock Card.`
                : 'Nothing is posted to the Stock Card.'
              : `Confirming adds every line to the Stock Card as a receipt from ${note.source}.`}
          </p>
        </>
      )}
    </div>
  )
}
