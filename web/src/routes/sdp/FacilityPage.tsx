import { Activity, AlertOctagon, ArrowLeft, Building2, ClipboardList, Gauge, Lock, MapPin, Package, PackageX, Plus, Send, TrendingDown, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertList } from '../../components/alerts/AlertList'
import { IncomingDeliveries } from '../../components/delivery-notes/IncomingDeliveries'
import { DispatchForm } from '../../components/dispatches/DispatchForm'
import { DispatchList } from '../../components/dispatches/DispatchList'
import { ActivityChart } from '../../components/charts/ActivityChart'
import { StockPositionChart } from '../../components/charts/StockPositionChart'
import { StatusDonut } from '../../components/charts/StatusDonut'
import { BulkImportButton } from '../../components/import/BulkImport'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { ReorderRequestForm } from '../../components/reorder/ReorderRequestForm'
import { ReorderRequestList } from '../../components/reorder/ReorderRequestList'
import { ReorderSuggestionsTable } from '../../components/stock/ReorderSuggestionsTable'
import { RunningBalanceHistory } from '../../components/stock/RunningBalanceHistory'
import { ExpiryBadge } from '../../components/stock/StatusBadges'
import { StockBalanceTable } from '../../components/stock/StockBalanceTable'
import { TransactionForm } from '../../components/stock/TransactionForm'
import { KpiTile } from '../../components/ui/KpiTile'
import { Modal } from '../../components/ui/Modal'
import { canRecordAt } from '../../lib/auth'
import { LEVEL_COLOR } from '../../lib/chart-theme'
import { LEVEL_LABEL, formatDate, formatQty } from '../../lib/format'
import {
  type HistoryFilters,
  useAlerts,
  useFacility,
  useFacilityActivity,
  useProducts,
  useReorderSuggestions,
  useStockBalances,
} from '../../lib/queries'
import type { Facility, ProductStock, StockLevel, User } from '../../lib/types'

const LEVELS: StockLevel[] = ['stock_out', 'low_stock', 'reorder', 'ok']

/** Batches that are expired or expiring soon, earliest first. */
function expiryWatch(stock: ProductStock[]) {
  return stock
    .flatMap((s) =>
      s.batches
        .filter((b) => b.quantity_on_hand > 0 && b.expiry_status && b.expiry_status !== 'ok')
        .map((b) => ({ product: s.product, batch: b })),
    )
    .sort((a, b) => (a.batch.expiry_date ?? '').localeCompare(b.batch.expiry_date ?? ''))
}

/** Where "back" goes: a store to its own dashboard level, an SDP to its LGA. */
function backLink(f: Facility, user: User): { to: string; label: string } | null {
  switch (f.store_level) {
    case 'national':
      return { to: '/federal', label: 'Nigeria' }
    case 'state':
      return f.state && { to: `/states/${f.state.id}`, label: `${f.state.name} State` }
    case 'lga':
      return f.lga && { to: `/lgas/${f.lga.id}`, label: `${f.lga.name} LGA` }
    default:
      return user.role !== 'sdp_staff' && f.lga ? { to: `/lgas/${f.lga.id}`, label: `${f.lga.name} LGA` } : null
  }
}

/**
 * A facility's digital Stock Card: overview, current stock, the entry form
 * (in a modal, for staff who can record here) and the running-balance
 * history. Officers drilling down from a rollup get the same page read-only.
 * An LGA / State / National store gets the same page, plus issuing stock to
 * the facilities below it and the list of what it has issued.
 */
export function FacilityPage({ facilityId, user }: { facilityId: number; user: User }) {
  const facility = useFacility(facilityId)
  const stock = useStockBalances(facilityId)
  const products = useProducts()
  const activity = useFacilityActivity(facilityId)
  const alerts = useAlerts({ facility_id: facilityId, per_page: 8 })
  const reorder = useReorderSuggestions(facilityId)
  const [history, setHistory] = useState<HistoryFilters>({ order: 'desc', page: 1, per_page: 25 })
  // null = closed; 0 = open with no product chosen; otherwise the product to pre-select.
  const [recording, setRecording] = useState<number | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const { hash } = useLocation()
  const loaded = !facility.isPending && !stock.isPending

  // In-page anchors (#history, #issued) from links on other pages.
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [loaded, hash])

  if (facility.isError) return <ErrorState error={facility.error} />
  if (facility.isPending || stock.isPending || products.isPending) return <Loading />
  if (stock.isError) return <ErrorState error={stock.error} />
  if (products.isError) return <ErrorState error={products.error} />

  const f = facility.data
  const rows = stock.data
  const canRecord = canRecordAt(user, facilityId)
  const isStore = f.store_level !== null
  const back = backLink(f, user)
  // Everyone but the National Store has a store above to ask.
  const canRequest = canRecord && f.store_level !== 'national'
  const place = [f.lga?.name, f.state?.name ?? 'Nigeria'].filter(Boolean).join(', ')
  const deliveriesHref = user.role === 'sdp_staff' ? '/delivery-notes' : `/facilities/${facilityId}/delivery-notes`
  const count = (pred: (s: ProductStock) => boolean) => rows.filter(pred).length
  const stockOuts = count((s) => s.level === 'stock_out')
  const low = count((s) => s.level === 'low_stock')
  const expired = count((s) => s.flags.includes('expired'))
  const expiring = count((s) => s.flags.includes('expiring_soon'))
  const okCount = count((s) => s.level === 'ok')
  const watch = expiryWatch(rows)
  const totals = activity.data?.totals
  const entries = totals ? totals.received + totals.issued + totals.other : undefined

  const showCard = (productId: number) => {
    setHistory({ ...history, product_id: productId, page: 1 })
    document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          {back && (
            <Link to={back.to} className="back-link">
              <ArrowLeft size={15} /> {back.label}
            </Link>
          )}
          <p className="eyebrow">{isStore ? 'Store stock card' : 'Facility stock card'}</p>
          <h1>{f.name}</h1>
          <div className="meta-row" style={{ marginTop: '0.35rem' }}>
            <span style={{ textTransform: 'capitalize' }}>
              <Building2 size={15} /> {isStore ? `${f.store_level === 'lga' ? 'LGA' : f.store_level} store` : f.type.replace('_', ' ')}
            </span>
            <span>
              <MapPin size={15} /> {place}
            </span>
            {!f.is_active && <span className="badge badge-neutral">Inactive</span>}
          </div>
        </div>
        <div className="head-actions">
          <Link to={`/facilities/${facilityId}/levels`} className="btn btn-ghost" title="Min / EOP / max per product here">
            <Gauge size={18} /> Stock levels
          </Link>
          <Link to={deliveriesHref} className="btn btn-ghost">
            <Truck size={18} /> Delivery notes
          </Link>
          {canRequest && (
            <button type="button" className="btn btn-ghost" onClick={() => setRequesting(true)}>
              <ClipboardList size={18} /> Request reorder
            </button>
          )}
          {canRecord && isStore && (
            <button type="button" className="btn btn-ghost" onClick={() => setDispatching(true)}>
              <Send size={18} /> Issue to facility
            </button>
          )}
          {canRecord && (
            <BulkImportButton
              kind="stock-entries"
              facilityId={facilityId}
              noun="entries"
              label="Import entries"
              title={`Import Stock Card entries at ${f.name}`}
              intro="Record many Stock Card entries at once — for example the opening physical inventory when a facility starts on the system, or rows copied from the paper card. Rows are recorded top to bottom, under the same rules as the form."
              invalidates={[
                ['stock-balances', facilityId],
                ['stock-transactions', facilityId],
                ['lga-summary'],
                ['state-summary'],
                ['federal-summary'],
                ['stock-activity'],
                ['alerts'],
                ['reorder-suggestions', facilityId],
              ]}
            />
          )}
          {canRecord ? (
            <button type="button" className="btn btn-primary" onClick={() => setRecording(0)}>
              <Plus size={18} /> Record transaction
            </button>
          ) : (
            <span className="badge badge-neutral badge-plain">
              <Lock size={12} /> Read-only
            </span>
          )}
        </div>
      </header>

      {flash && (
        <p className="form-success" role="status" style={{ margin: 0 }}>
          {flash}
        </p>
      )}

      <IncomingDeliveries facilityId={facilityId} canAct={canRecord} deliveriesHref={deliveriesHref} />

      {isStore && <ReorderRequestList facilityId={facilityId} direction="incoming" canAct={canRecord} hideWhenEmpty={!canRecord} />}

      <div className="kpi-grid">
        <KpiTile tone="primary" icon={Package} label="Products tracked" value={rows.length} sub={`${okCount} at a healthy level`} />
        <KpiTile
          tone={stockOuts ? 'critical' : 'default'}
          icon={PackageX}
          label="Stock-outs"
          value={stockOuts}
          sub={stockOuts ? 'No usable stock left' : 'None — good'}
        />
        <KpiTile
          tone={low ? 'warning' : 'default'}
          icon={TrendingDown}
          label="At EOP"
          value={low}
          sub="At or below the emergency order point"
        />
        <KpiTile tone="dark" icon={AlertOctagon} label="Expired stock" value={expired} sub={`${expiring} more expiring soon`} />
        <KpiTile
          icon={Activity}
          label="Entries, last 12 weeks"
          value={entries ?? '—'}
          sub={
            activity.data?.last_transaction_date
              ? `Last entry ${formatDate(activity.data.last_transaction_date)}`
              : 'No entries yet'
          }
        />
      </div>

      {alerts.data && alerts.data.data.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Alerts needing attention</h2>
              <p>
                {alerts.data.meta.pagination.total} at this facility · cleared automatically when the stock situation is fixed
              </p>
            </div>
            <Link to="/alerts" className="btn btn-ghost btn-sm">
              All alerts
            </Link>
          </div>
          <AlertList alerts={alerts.data.data} showFacility={false} />
        </section>
      )}

      <div className="grid-chart">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Recording activity</h2>
              <p>Stock Card entries per week</p>
            </div>
          </div>
          {activity.isError ? (
            <ErrorState error={activity.error} />
          ) : activity.isPending ? (
            <div className="chart-box chart-empty">Loading…</div>
          ) : (
            <ActivityChart weeks={activity.data.weeks} />
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Stock status</h2>
              <p>Products by usable stock against thresholds</p>
            </div>
          </div>
          <StatusDonut
            slices={LEVELS.map((l) => ({ key: l, label: LEVEL_LABEL[l], value: count((s) => s.level === l), color: LEVEL_COLOR[l] }))}
            centerValue={rows.length}
            centerLabel="products"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Lowest stock positions</h2>
              <p>Usable stock as a share of each product's max level</p>
            </div>
          </div>
          <StockPositionChart stock={rows} />
        </section>
        <section className="card card-flush">
          <div className="card-head">
            <div>
              <h2>Expiry watch</h2>
              <p>Batches expired or expiring soon, earliest first</p>
            </div>
          </div>
          {watch.length === 0 ? (
            <p className="empty">No batches expired or expiring soon.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="num">On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {watch.slice(0, 8).map(({ product, batch }) => (
                    <tr key={`${product.id}-${batch.batch_id}`}>
                      <td>
                        <div className="cell-title">{product.name}</div>
                        <div className="muted small">{product.sku}</div>
                      </td>
                      <td className="mono">{batch.batch_no}</td>
                      <td className="nowrap">
                        {formatDate(batch.expiry_date)} <ExpiryBadge status={batch.expiry_status} />
                      </td>
                      <td className="num">
                        {formatQty(batch.quantity_on_hand)} <span className="muted small">{product.unit_of_measure}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Current stock</h2>
            <p>Balances from the ledger{stock.isFetching ? ' · updating…' : ''}</p>
          </div>
        </div>
        <StockBalanceTable
          stock={rows}
          onShowHistory={showCard}
          onRecord={canRecord ? (id) => setRecording(id) : undefined}
        />
      </section>

      {isStore && (
        <div id="issued">
          <DispatchList facilityId={facilityId} />
        </div>
      )}

      {f.store_level !== 'national' && <ReorderRequestList facilityId={facilityId} direction="outgoing" canAct={canRecord} hideWhenEmpty={!canRecord} />}

      <section className="card card-flush">
        {reorder.isError ? (
          <ErrorState error={reorder.error} />
        ) : reorder.isPending ? (
          <p className="empty">Loading reorder suggestions…</p>
        ) : (
          <ReorderSuggestionsTable rows={reorder.data} />
        )}
      </section>

      <div id="history">
        <RunningBalanceHistory
          facilityId={facilityId}
          products={products.data}
          filters={history}
          onFiltersChange={setHistory}
        />
      </div>

      {canRecord && (
        <Modal
          open={recording !== null}
          onClose={() => setRecording(null)}
          title="Record a transaction"
          description={`New Stock Card entry at ${f.name}`}
          icon={<Plus size={20} />}
        >
          <TransactionForm
            facilityId={facilityId}
            products={products.data}
            stock={rows}
            initialProductId={recording || undefined}
            onCancel={() => setRecording(null)}
          />
        </Modal>
      )}

      {canRequest && (
        <Modal
          open={requesting}
          onClose={() => setRequesting(false)}
          size="lg"
          title="Request a reorder"
          description={`Ask a store above ${f.name} to send stock`}
          icon={<ClipboardList size={20} />}
        >
          <ReorderRequestForm
            facilityId={facilityId}
            onCancel={() => setRequesting(false)}
            onDone={(r) => {
              setRequesting(false)
              setFlash(`${r.number} sent to ${r.supplier.name}. Their officers have been notified; you'll hear when it's on its way.`)
            }}
          />
        </Modal>
      )}

      {canRecord && isStore && (
        <Modal
          open={dispatching}
          onClose={() => setDispatching(false)}
          size="lg"
          title="Issue to a facility"
          description={`From ${f.name} to a facility one level down`}
          icon={<Send size={20} />}
        >
          <DispatchForm
            facilityId={facilityId}
            stock={rows}
            onCancel={() => setDispatching(false)}
            onDone={(note) => {
              setDispatching(false)
              setFlash(
                `Issued ${note.items.length} line${note.items.length === 1 ? '' : 's'} to ${note.facility.name} (${note.delivery_note_no}). It lands on their Stock Card once they confirm it.`,
              )
            }}
          />
        </Modal>
      )}
    </div>
  )
}
