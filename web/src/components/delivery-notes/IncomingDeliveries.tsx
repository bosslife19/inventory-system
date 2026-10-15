import { Inbox, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatQty } from '../../lib/format'
import { useDeliveryNotes } from '../../lib/queries'
import type { DeliveryNote } from '../../lib/types'
import { Modal } from '../ui/Modal'
import { DeliveryNoteDetail } from './DeliveryNoteDetail'

/** "AL ×40, ORS ×100 +2 more" */
function summarize(n: DeliveryNote): string {
  const parts = n.items.slice(0, 2).map((i) => `${i.product.sku} ×${formatQty(i.quantity)}`)
  return n.items.length > 2 ? `${parts.join(', ')} +${n.items.length - 2} more` : parts.join(', ')
}

/**
 * Deliveries waiting to be signed for at this facility — stock issued from
 * the level above, and drafts typed in or scanned. Shown on the dashboard
 * only while there are some, since none of it is on the Stock Card yet.
 */
export function IncomingDeliveries({ facilityId, canAct, deliveriesHref }: { facilityId: number; canAct: boolean; deliveriesHref: string }) {
  const drafts = useDeliveryNotes(facilityId, 'draft', 1)
  const [openId, setOpenId] = useState<number | null>(null)

  const rows = drafts.data?.data ?? []
  const total = drafts.data?.meta.pagination.total ?? 0
  const open = rows.find((n) => n.id === openId) ?? null
  if (total === 0) return null

  return (
    <section className="card card-flush incoming-card">
      <div className="card-head">
        <div className="store-title">
          <span className="store-icon is-warning" aria-hidden>
            <Inbox size={20} />
          </span>
          <div>
            <h2>
              {total} incoming {total === 1 ? 'delivery' : 'deliveries'} to confirm
            </h2>
            <p>Not on the Stock Card until {canAct ? 'you confirm' : 'someone here confirms'} what arrived</p>
          </div>
        </div>
        <Link to={deliveriesHref} className="btn btn-ghost btn-sm">
          All delivery notes
        </Link>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>From</th>
              <th className="hide-sm">Issued</th>
              <th className="hide-sm">Note no.</th>
              <th>Lines</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} className="row-link" onClick={() => setOpenId(n.id)}>
                <td className="cell-title">{n.source}</td>
                <td className="hide-sm nowrap">{formatDate(n.dispatched_date ?? n.received_date)}</td>
                <td className="hide-sm mono">{n.delivery_note_no ?? '—'}</td>
                <td>
                  <strong>{n.items.length}</strong>
                  <div className="muted small line-summary">{summarize(n)}</div>
                </td>
                <td className="num">
                  <button type="button" className={`btn btn-sm ${canAct ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOpenId(n.id)}>
                    {canAct ? 'Review & confirm' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > rows.length && (
        <p className="muted small" style={{ padding: '0 1.25rem 1rem', margin: 0 }}>
          Showing {rows.length} of {total}. <Link to={deliveriesHref}>See them all</Link>.
        </p>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open ? `Delivery from ${open.source}` : 'Delivery note'}
        description={open?.delivery_note_no ?? undefined}
        icon={<Truck size={20} />}
      >
        {open && <DeliveryNoteDetail note={open} facilityId={facilityId} canAct={canAct} onDone={() => setOpenId(null)} />}
      </Modal>
    </section>
  )
}
