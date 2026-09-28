import { Activity, AlertOctagon, ArrowLeft, Building2, Lock, MapPin, Package, PackageX, Plus, TrendingDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityChart } from '../../components/charts/ActivityChart'
import { StockPositionChart } from '../../components/charts/StockPositionChart'
import { StatusDonut } from '../../components/charts/StatusDonut'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { RunningBalanceHistory } from '../../components/stock/RunningBalanceHistory'
import { ExpiryBadge } from '../../components/stock/StatusBadges'
import { StockBalanceTable } from '../../components/stock/StockBalanceTable'
import { TransactionForm } from '../../components/stock/TransactionForm'
import { KpiTile } from '../../components/ui/KpiTile'
import { Modal } from '../../components/ui/Modal'
import { canRecordAt } from '../../lib/auth'
import { LEVEL_COLOR } from '../../lib/chart-theme'
import { LEVEL_LABEL, formatDate, formatQty } from '../../lib/format'
import { type HistoryFilters, useFacility, useFacilityActivity, useProducts, useStockBalances } from '../../lib/queries'
import type { ProductStock, StockLevel, User } from '../../lib/types'

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

/**
 * A facility's digital Stock Card: overview, current stock, the entry form
 * (in a modal, for staff who can record here) and the running-balance
 * history. Officers drilling down from a rollup get the same page read-only.
 */
export function FacilityPage({ facilityId, user }: { facilityId: number; user: User }) {
  const facility = useFacility(facilityId)
  const stock = useStockBalances(facilityId)
  const products = useProducts()
  const activity = useFacilityActivity(facilityId)
  const [history, setHistory] = useState<HistoryFilters>({ order: 'desc', page: 1, per_page: 25 })
  // null = closed; 0 = open with no product chosen; otherwise the product to pre-select.
  const [recording, setRecording] = useState<number | null>(null)

  if (facility.isError) return <ErrorState error={facility.error} />
  if (facility.isPending || stock.isPending || products.isPending) return <Loading />
  if (stock.isError) return <ErrorState error={stock.error} />
  if (products.isError) return <ErrorState error={products.error} />

  const f = facility.data
  const rows = stock.data
  const canRecord = canRecordAt(user, facilityId)
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
          {user.role !== 'sdp_staff' && (
            <Link to={`/lgas/${f.lga.id}`} className="back-link">
              <ArrowLeft size={15} /> {f.lga.name} LGA
            </Link>
          )}
          <p className="eyebrow">Facility stock card</p>
          <h1>{f.name}</h1>
          <div className="meta-row" style={{ marginTop: '0.35rem' }}>
            <span style={{ textTransform: 'capitalize' }}>
              <Building2 size={15} /> {f.type.replace('_', ' ')}
            </span>
            <span>
              <MapPin size={15} /> {f.lga.name}, {f.state.name}
            </span>
            {!f.is_active && <span className="badge badge-neutral">Inactive</span>}
          </div>
        </div>
        <div className="head-actions">
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
          label="Low stock"
          value={low}
          sub="Below the minimum level"
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
    </div>
  )
}
