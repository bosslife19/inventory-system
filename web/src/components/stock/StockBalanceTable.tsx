import { Fragment, useState } from 'react'
import { formatDate, formatQty } from '../../lib/format'
import type { ProductStock } from '../../lib/types'
import { ExpiryBadge, FlagBadges, LevelBadge } from './StatusBadges'

interface Props {
  stock: ProductStock[]
  onShowHistory?: (productId: number) => void
}

/** Current stock per product, straight from stock_balances (quantities are never computed client-side). */
export function StockBalanceTable({ stock, onShowHistory }: Props) {
  const [open, setOpen] = useState<number | null>(null)

  if (stock.length === 0) {
    return <p className="empty">No stock recorded at this facility yet.</p>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">On hand</th>
            <th className="num">Usable</th>
            <th>Status</th>
            <th className="num hide-sm">Min / EOP / Max</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {stock.map((row) => {
            const p = row.product
            const isOpen = open === p.id
            const batches = row.batches.filter((b) => b.quantity_on_hand > 0)

            return (
              <Fragment key={p.id}>
                <tr className={row.level === 'stock_out' ? 'row-critical' : undefined}>
                  <td>
                    <div className="cell-title">{p.name}</div>
                    <div className="muted small">
                      {p.sku} · {p.unit_of_measure}
                      {p.requires_cold_chain && ' · cold chain'}
                    </div>
                  </td>
                  <td className="num">{formatQty(row.quantity_on_hand)}</td>
                  <td className="num">
                    <strong>{formatQty(row.usable_quantity)}</strong>
                    {row.expired_quantity > 0 && (
                      <div className="small text-critical">{formatQty(row.expired_quantity)} expired</div>
                    )}
                  </td>
                  <td>
                    <div className="badge-row">
                      <LevelBadge level={row.level} />
                      <FlagBadges flags={row.flags.filter((f) => f !== 'stock_out' && f !== 'low_stock')} />
                    </div>
                  </td>
                  <td className="num muted hide-sm">
                    {p.min_stock_level} / {p.reorder_level} / {p.max_stock_level}
                  </td>
                  <td className="actions">
                    {p.requires_batch_tracking && batches.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-link"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : p.id)}
                      >
                        {batches.length} batch{batches.length === 1 ? '' : 'es'}
                      </button>
                    )}
                    {onShowHistory && (
                      <button type="button" className="btn btn-link" onClick={() => onShowHistory(p.id)}>
                        Stock card
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="row-detail">
                    <td colSpan={6}>
                      <table className="table table-inner">
                        <thead>
                          <tr>
                            <th>Batch</th>
                            <th>Expiry</th>
                            <th className="num">On hand</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map((b) => (
                            <tr key={b.batch_id}>
                              <td className="mono">{b.batch_no}</td>
                              <td>
                                {formatDate(b.expiry_date)} <ExpiryBadge status={b.expiry_status} />
                              </td>
                              <td className="num">{formatQty(b.quantity_on_hand)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
