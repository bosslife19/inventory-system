import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, FilePen, FileX, Plus, ScanLine, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CaptureBadge, DeliveryStatusBadge } from '../../components/delivery-notes/DeliveryNoteBadges'
import { DeliveryNoteDetail } from '../../components/delivery-notes/DeliveryNoteDetail'
import { DeliveryNoteForm } from '../../components/delivery-notes/DeliveryNoteForm'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { KpiTile } from '../../components/ui/KpiTile'
import { Modal } from '../../components/ui/Modal'
import { canRecordAt } from '../../lib/auth'
import { formatDate, formatQty } from '../../lib/format'
import { useDeliveryNoteCount, useDeliveryNotes, useFacility, useProducts, useStockBalances } from '../../lib/queries'
import type { DeliveryNote, DeliveryNoteStatus, User } from '../../lib/types'

const TABS: { value: DeliveryNoteStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
]

/**
 * A facility's incoming deliveries (docs/API_CONTRACT.md, "Delivery notes"):
 * notes scanned on the phone and confirmed there, notes typed in here, and
 * drafts waiting for someone to check and confirm them.
 */
export function DeliveryNotesPage({ facilityId, user }: { facilityId: number; user: User }) {
  const facility = useFacility(facilityId)
  const [status, setStatus] = useState<DeliveryNoteStatus | undefined>(undefined)
  const [page, setPage] = useState(1)
  const notes = useDeliveryNotes(facilityId, status, page)
  const drafts = useDeliveryNoteCount(facilityId, 'draft')
  const confirmed = useDeliveryNoteCount(facilityId, 'confirmed')
  const rejected = useDeliveryNoteCount(facilityId, 'rejected')
  const canAct = canRecordAt(user, facilityId)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (facility.isError) return <ErrorState error={facility.error} />
  if (facility.isPending) return <Loading />

  const f = facility.data
  const rows = notes.data?.data ?? []
  const open = rows.find((n) => n.id === openId) ?? null
  const pagination = notes.data?.meta.pagination
  const show = (n: number | undefined) => (n === undefined ? '—' : formatQty(n))

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <Link to={user.role === 'sdp_staff' ? '/sdp' : `/facilities/${facilityId}`} className="back-link">
            <ArrowLeft size={15} /> {f.name}
          </Link>
          <p className="eyebrow">Deliveries</p>
          <h1>Delivery notes</h1>
          <p className="muted">Incoming shipments, scanned on the phone or typed in, and the receipts they became.</p>
        </div>
        {canAct && (
          <div className="head-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={18} /> New delivery note
            </button>
          </div>
        )}
      </header>

      {flash && (
        <p className="form-success" role="status" style={{ margin: 0 }}>
          <CheckCircle2 size={16} />
          {flash}
        </p>
      )}

      <div className="kpi-grid">
        <KpiTile tone={drafts.data ? 'warning' : 'default'} icon={FilePen} label="Drafts to check" value={show(drafts.data)} sub="Not on the Stock Card yet" />
        <KpiTile tone="primary" icon={ClipboardCheck} label="Confirmed deliveries" value={show(confirmed.data)} sub="Posted as receipts" />
        <KpiTile tone="dark" icon={FileX} label="Rejected" value={show(rejected.data)} sub="Never posted" />
        <KpiTile icon={ScanLine} label="Scan on the phone" value="App" sub="Home → Scan delivery" />
      </div>

      <section className="card card-flush">
        <div className="card-head">
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
          {notes.isFetching && <span className="muted small">Updating…</span>}
        </div>

        {notes.isError ? (
          <ErrorState error={notes.error} />
        ) : notes.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Truck size={28} aria-hidden />
            {status ? `No ${status} delivery notes.` : 'No delivery notes yet. Scan one on the phone or type one in.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th className="hide-sm">Note no.</th>
                  <th>Lines</th>
                  <th className="hide-sm">Captured</th>
                  <th>Status</th>
                  <th className="hide-sm">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className="row-link" onClick={() => setOpenId(n.id)}>
                    <td className="nowrap">{formatDate(n.received_date)}</td>
                    <td>
                      <button type="button" className="link-button cell-title" onClick={() => setOpenId(n.id)}>
                        {n.source}
                      </button>
                    </td>
                    <td className="hide-sm mono">{n.delivery_note_no ?? '—'}</td>
                    <td>
                      <strong>{n.items.length}</strong>
                      <div className="muted small line-summary">{summarize(n)}</div>
                    </td>
                    <td className="hide-sm">
                      <CaptureBadge method={n.capture_method} />
                    </td>
                    <td>
                      <DeliveryStatusBadge status={n.status} />
                    </td>
                    <td className="hide-sm small">{n.confirmed_by_name ?? n.rejected_by_name ?? n.created_by_name}</td>
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
              Page {pagination.current_page} of {pagination.last_page} · {formatQty(pagination.total)} notes
            </span>
            <button type="button" className="btn btn-ghost" disabled={page >= pagination.last_page} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </nav>
        )}
      </section>

      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open ? `Delivery from ${open.source}` : 'Delivery note'}
        description={open ? `Received ${formatDate(open.received_date)}${open.delivery_note_no ? ` · ${open.delivery_note_no}` : ''}` : undefined}
        icon={<Truck size={20} />}
      >
        {open && (
          <DeliveryNoteDetail
            note={open}
            facilityId={facilityId}
            canAct={canAct}
            onDone={() => {
              setFlash(null)
              setOpenId(null)
            }}
          />
        )}
      </Modal>

      {canAct && (
        <Modal
          open={creating}
          onClose={() => setCreating(false)}
          size="lg"
          title="New delivery note"
          description={`Type in a delivery received at ${f.name}`}
          icon={<Plus size={20} />}
        >
          <NewNote
            facilityId={facilityId}
            onDone={(message) => {
              setFlash(message)
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      )}
    </div>
  )
}

function NewNote({ facilityId, onDone, onCancel }: { facilityId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const products = useProducts()
  const stock = useStockBalances(facilityId)
  if (products.isPending || stock.isPending) return <Loading />
  if (products.isError || stock.isError)
    return (
      <p className="form-error" role="alert">
        <AlertCircle size={16} /> Couldn’t load products. Try again.
      </p>
    )
  return <DeliveryNoteForm facilityId={facilityId} products={products.data} stock={stock.data} onDone={onDone} onCancel={onCancel} />
}

/** "AL 20/120 ×40, ORS ×100 +2 more" */
function summarize(n: DeliveryNote): string {
  const parts = n.items.slice(0, 2).map((i) => `${i.product.sku} ×${formatQty(i.quantity)}`)
  return n.items.length > 2 ? `${parts.join(', ')} +${n.items.length - 2} more` : parts.join(', ')
}
