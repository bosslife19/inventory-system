import { formatQty } from '../../lib/format'
import type { ProductRollup } from '../../lib/types'

/** Per-product totals across a rollup node — the consolidated view of reorder needs. */
export function ProductRollupTable({ rows, childNoun }: { rows: ProductRollup[]; childNoun: string }) {
  if (rows.length === 0) return <p className="empty">No stock recorded yet.</p>
  const noun = childNoun.toLowerCase()

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Usable</th>
            <th className="num hide-sm">Expired</th>
            <th className="num">{childNoun} out of stock</th>
            <th className="num">{childNoun} low</th>
            <th className="num">{childNoun} needing reorder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product.id}>
              <td>
                <div className="cell-title">{r.product.name}</div>
                <div className="muted small">
                  {r.product.sku} · {r.product.unit_of_measure}
                </div>
              </td>
              <td className="num">{formatQty(r.usable_quantity)}</td>
              <td className={`num hide-sm${r.expired_quantity ? ' text-critical' : ''}`}>
                {formatQty(r.expired_quantity)}
              </td>
              <td className={`num${r.facility_counts.stock_out ? ' text-critical' : ''}`}>
                {r.facility_counts.stock_out}
              </td>
              <td className={`num${r.facility_counts.low_stock ? ' text-warning' : ''}`}>
                {r.facility_counts.low_stock}
              </td>
              <td className="num" title={`${noun} at or below the reorder level (EOP)`}>
                {r.facilities_needing_reorder}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
