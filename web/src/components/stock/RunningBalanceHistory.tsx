import { INBOUND, TRANSACTION_TYPES, formatDate, formatQty, transactionLabel } from '../../lib/format'
import { type HistoryFilters, useStockTransactions } from '../../lib/queries'
import type { Product, StockTransaction, TransactionType } from '../../lib/types'
import { ErrorState } from '../layout/PageState'

interface Props {
  facilityId: number
  products: Product[]
  filters: HistoryFilters
  onFiltersChange: (filters: HistoryFilters) => void
}

/** Which Stock Card column a row's quantity belongs in. */
function column(tx: StockTransaction): 'in' | 'out' | 'adj' | 'count' {
  if (tx.transaction_type === 'physical_count') return 'count'
  if (tx.transaction_type === 'loss' || tx.transaction_type.startsWith('adjustment')) return 'adj'
  return INBOUND.includes(tx.transaction_type) ? 'in' : 'out'
}

/**
 * The Stock Card history, laid out like the paper card / Excel template.
 * STOCK BALANCE is the server's running_balance for each row — never recomputed here.
 */
export function RunningBalanceHistory({ facilityId, products, filters, onFiltersChange }: Props) {
  const history = useStockTransactions(facilityId, filters)
  const set = (patch: Partial<HistoryFilters>) => onFiltersChange({ ...filters, page: 1, ...patch })
  const showProduct = filters.product_id === undefined
  const pagination = history.data?.meta.pagination

  return (
    <section className="card">
      <div className="card-head">
        <h2>Stock card history</h2>
        <div className="filters">
          <select
            aria-label="Product"
            value={filters.product_id ?? ''}
            onChange={(e) => set({ product_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Transaction type"
            value={filters.transaction_type ?? ''}
            onChange={(e) => set({ transaction_type: (e.target.value || undefined) as TransactionType | undefined })}
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="inline-field">
            From
            <input type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          </label>
          <label className="inline-field">
            To
            <input type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          </label>
          <select
            aria-label="Order"
            value={filters.order}
            onChange={(e) => set({ order: e.target.value as 'asc' | 'desc' })}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first (card order)</option>
          </select>
        </div>
      </div>

      {showProduct && (
        <p className="muted small">
          Stock balance is per product — pick a product to read it as a single stock card.
        </p>
      )}

      {history.isError ? (
        <ErrorState error={history.error} />
      ) : (
        <div className={`table-wrap${history.isFetching ? ' is-fetching' : ''}`}>
          <table className="table stock-card">
            <thead>
              <tr>
                <th>Date</th>
                {showProduct && <th>Product</th>}
                <th className="hide-sm">Voucher</th>
                <th>Received from / Issued to</th>
                <th>Batch</th>
                <th className="hide-sm">Expiry</th>
                <th className="num">Received</th>
                <th className="num">Issued</th>
                <th className="num">Loss / Adj.</th>
                <th className="num">Stock balance</th>
                <th className="hide-sm">By</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.data.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">
                    No transactions match these filters.
                  </td>
                </tr>
              )}
              {history.data?.data.map((tx) => {
                const col = column(tx)
                return (
                  <tr key={tx.id}>
                    <td className="nowrap">{formatDate(tx.transaction_date)}</td>
                    {showProduct && <td>{tx.product_name}</td>}
                    <td className="hide-sm mono">{tx.voucher_no ?? ''}</td>
                    <td>
                      {tx.counterparty ?? <span className="muted">{transactionLabel(tx.transaction_type)}</span>}
                      {tx.comments && <div className="muted small">{tx.comments}</div>}
                    </td>
                    <td className="mono">{tx.batch_no ?? ''}</td>
                    <td className="hide-sm nowrap">{tx.expiry_date ? formatDate(tx.expiry_date) : ''}</td>
                    <td className="num">{col === 'in' ? formatQty(tx.quantity) : ''}</td>
                    <td className="num">{col === 'out' ? formatQty(tx.quantity) : ''}</td>
                    <td className="num">
                      {col === 'adj' &&
                        `${tx.transaction_type === 'adjustment_in' ? '+' : '−'}${formatQty(tx.quantity)}`}
                      {col === 'count' && <span title="Physical count: batch set to this quantity">= {formatQty(tx.quantity)}</span>}
                    </td>
                    <td className="num">
                      <strong>{formatQty(tx.running_balance)}</strong>
                    </td>
                    <td className="hide-sm small">{tx.performed_by_name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.last_page > 1 && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pagination.current_page <= 1}
            onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}
          >
            ← Previous
          </button>
          <span className="muted">
            Page {pagination.current_page} of {pagination.last_page} · {formatQty(pagination.total)} entries
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pagination.current_page >= pagination.last_page}
            onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  )
}
