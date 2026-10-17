import { ArrowRight, ClipboardList, Download, Inbox, Lock, Package, PackageX, Send, Truck, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { canRecordAt } from '../../lib/auth'
import { formatQty } from '../../lib/format'
import { useDeliveryNoteCount, useDispatches, useProducts, useReorderSuppliers, useStockBalances } from '../../lib/queries'
import type { User } from '../../lib/types'
import { DispatchForm } from '../dispatches/DispatchForm'
import { ReorderRequestForm } from '../reorder/ReorderRequestForm'
import { ReorderRequestList } from '../reorder/ReorderRequestList'
import { ErrorState } from '../layout/PageState'
import { TransactionForm } from '../stock/TransactionForm'
import { Modal } from '../ui/Modal'

/**
 * The LGA / State / National store on its rollup dashboard: a glance at its
 * own Stock Card and, for the officers who keep it, receiving and issuing
 * without leaving the dashboard. The store isn't part of the rollup itself.
 */
export function StorePanel({ store, user }: { store: { id: number; name: string }; user: User }) {
  const canAct = canRecordAt(user, store.id)
  const stock = useStockBalances(store.id)
  const incoming = useDeliveryNoteCount(store.id, 'draft')
  const inTransit = useDispatches(store.id, 'draft', 1, 1)
  const products = useProducts()
  // Stores above this one it may ask; none for the National Store (the API says 403).
  const suppliers = useReorderSuppliers(store.id, canAct)
  const canRequest = canAct && (suppliers.data?.length ?? 0) > 0
  const [modal, setModal] = useState<'receive' | 'issue' | 'request' | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const rows = stock.data ?? []
  const inStock = rows.filter((s) => s.usable_quantity > 0).length
  const stockOuts = rows.filter((s) => s.level === 'stock_out').length
  const show = (n: number | undefined) => (n === undefined ? '—' : formatQty(n))
  const deliveriesHref = `/facilities/${store.id}/delivery-notes`

  return (
    <>
      <section className="card store-panel">
        <div className="card-head">
          <div className="store-title">
            <span className="store-icon" aria-hidden>
              <Warehouse size={20} />
            </span>
            <div>
              <h2>{store.name}</h2>
              <p>{canAct ? 'Your store’s own Stock Card — receive from suppliers and issue down the chain' : 'This store’s own Stock Card'}</p>
            </div>
          </div>
          <div className="head-actions">
            {canAct ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setModal('receive')}>
                  <Download size={17} /> Receive stock
                </button>
                {canRequest && (
                  <button type="button" className="btn btn-ghost" onClick={() => setModal('request')}>
                    <ClipboardList size={17} /> Request stock
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => setModal('issue')}>
                  <Send size={17} /> Issue to facility
                </button>
              </>
            ) : (
              <span className="badge badge-neutral badge-plain">
                <Lock size={12} /> Read-only
              </span>
            )}
          </div>
        </div>

        {flash && (
          <p className="form-success" role="status" style={{ margin: '0 1.25rem 0.75rem' }}>
            {flash}
          </p>
        )}

        {stock.isError ? (
          <ErrorState error={stock.error} />
        ) : (
          <div className="store-stats">
            <Link to={`/facilities/${store.id}`} className="store-stat">
              <Package size={18} aria-hidden />
              <span>
                <strong>{stock.isPending ? '—' : inStock}</strong>
                <small>products in stock</small>
              </span>
            </Link>
            <Link to={`/facilities/${store.id}`} className={`store-stat${stockOuts ? ' is-critical' : ''}`}>
              <PackageX size={18} aria-hidden />
              <span>
                <strong>{stock.isPending ? '—' : stockOuts}</strong>
                <small>stock-outs</small>
              </span>
            </Link>
            <Link to={deliveriesHref} className={`store-stat${incoming.data ? ' is-warning' : ''}`}>
              <Inbox size={18} aria-hidden />
              <span>
                <strong>{show(incoming.data)}</strong>
                <small>deliveries to confirm</small>
              </span>
            </Link>
            <Link to={`/facilities/${store.id}#issued`} className="store-stat">
              <Truck size={18} aria-hidden />
              <span>
                <strong>{show(inTransit.data?.meta.pagination.total)}</strong>
                <small>issued, awaiting receipt</small>
              </span>
            </Link>
            <Link to={`/facilities/${store.id}`} className="store-stat store-stat-link">
              Open Stock Card <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        )}

        {canAct && (
          <>
            <Modal
              open={modal === 'receive'}
              onClose={() => setModal(null)}
              title="Receive stock"
              description={`New Stock Card entry at ${store.name}. Deliveries from the level above arrive under “deliveries to confirm”.`}
              icon={<Download size={20} />}
            >
              {products.data && stock.data ? (
                <TransactionForm
                  facilityId={store.id}
                  products={products.data}
                  stock={stock.data}
                  initialType="receipt"
                  onCancel={() => setModal(null)}
                />
              ) : (
                <p className="empty">Loading…</p>
              )}
            </Modal>
            <Modal
              open={modal === 'issue'}
              onClose={() => setModal(null)}
              size="lg"
              title="Issue to a facility"
              description={`From ${store.name} to a facility one level down`}
              icon={<Send size={20} />}
            >
              {stock.data ? (
                <DispatchForm
                  facilityId={store.id}
                  stock={stock.data}
                  onCancel={() => setModal(null)}
                  onDone={(note) => {
                    setModal(null)
                    setFlash(
                      `Issued ${note.items.length} line${note.items.length === 1 ? '' : 's'} to ${note.facility.name} (${note.delivery_note_no}). It lands on their Stock Card once they confirm it.`,
                    )
                  }}
                />
              ) : (
                <p className="empty">Loading…</p>
              )}
            </Modal>
            <Modal
              open={modal === 'request'}
              onClose={() => setModal(null)}
              size="lg"
              title="Request stock"
              description={`Ask a store above ${store.name} to send stock`}
              icon={<ClipboardList size={20} />}
            >
              <ReorderRequestForm
                facilityId={store.id}
                onCancel={() => setModal(null)}
                onDone={(r) => {
                  setModal(null)
                  setFlash(`${r.number} sent to ${r.supplier.name}. Their officers have been notified.`)
                }}
              />
            </Modal>
          </>
        )}
      </section>
      <ReorderRequestList facilityId={store.id} direction="incoming" canAct={canAct} hideWhenEmpty={!canAct} />
      {canRequest && <ReorderRequestList facilityId={store.id} direction="outgoing" canAct={canAct} hideWhenEmpty />}
    </>
  )
}
