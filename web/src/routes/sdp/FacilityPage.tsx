import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { RunningBalanceHistory } from '../../components/stock/RunningBalanceHistory'
import { StockBalanceTable } from '../../components/stock/StockBalanceTable'
import { TransactionForm } from '../../components/stock/TransactionForm'
import { canRecordAt } from '../../lib/auth'
import { type HistoryFilters, useFacility, useProducts, useStockBalances } from '../../lib/queries'
import type { User } from '../../lib/types'

/**
 * A facility's digital Stock Card: current stock, the entry form (for staff
 * who can record here), and the running-balance history. Officers drilling
 * down from a rollup get the same page read-only.
 */
export function FacilityPage({ facilityId, user }: { facilityId: number; user: User }) {
  const facility = useFacility(facilityId)
  const stock = useStockBalances(facilityId)
  const products = useProducts()
  const [history, setHistory] = useState<HistoryFilters>({ order: 'desc', page: 1, per_page: 25 })

  if (facility.isError) return <ErrorState error={facility.error} />
  if (facility.isPending || stock.isPending || products.isPending) return <Loading />
  if (stock.isError) return <ErrorState error={stock.error} />
  if (products.isError) return <ErrorState error={products.error} />

  const f = facility.data
  const canRecord = canRecordAt(user, facilityId)

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
              ← {f.lga.name} LGA
            </Link>
          )}
          <h1>{f.name}</h1>
          <p className="muted">
            {f.type.replace('_', ' ')} · {f.lga.name}, {f.state.name}
            {!f.is_active && ' · inactive'}
          </p>
        </div>
        {!canRecord && <span className="badge badge-neutral">Read-only</span>}
      </header>

      <div className={canRecord ? 'facility-grid' : undefined}>
        {canRecord && (
          <TransactionForm facilityId={facilityId} products={products.data} stock={stock.data} />
        )}
        <section className="card">
          <div className="card-head">
            <h2>Current stock</h2>
            {stock.isFetching && <span className="muted small">Updating…</span>}
          </div>
          <StockBalanceTable stock={stock.data} onShowHistory={showCard} />
        </section>
      </div>

      <div id="history">
        <RunningBalanceHistory
          facilityId={facilityId}
          products={products.data}
          filters={history}
          onFiltersChange={setHistory}
        />
      </div>
    </div>
  )
}
