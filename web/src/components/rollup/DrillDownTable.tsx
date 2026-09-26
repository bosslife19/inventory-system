import { Link } from 'react-router-dom'
import { formatQty } from '../../lib/format'
import type { FacilityStockSummary } from '../../lib/types'
import { FlagBadges, LevelBadge } from '../stock/StatusBadges'

interface Props {
  /** Child rows from a stock-summary endpoint, already sorted worst-first by the API. */
  rows: FacilityStockSummary[]
  hrefFor: (row: FacilityStockSummary) => string
  childNoun: string
}

/** Worst-first list of a rollup node's children — shared by the LGA, State and Federal views. */
export function DrillDownTable({ rows, hrefFor, childNoun }: Props) {
  if (rows.length === 0) return <p className="empty">No {childNoun.toLowerCase()} here yet.</p>

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{childNoun}</th>
            <th className="num">Stock-outs</th>
            <th className="num">Expired</th>
            <th className="num">Low</th>
            <th className="num">Expiring</th>
            <th className="num">Need reorder</th>
            <th>Flagged products</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const c = row.flag_counts
            return (
              <tr key={row.id} className={c.stock_out > 0 ? 'row-critical' : undefined}>
                <td>
                  <Link to={hrefFor(row)} className="cell-title">
                    {row.name}
                  </Link>
                  <div className="muted small">
                    {row.type.replace('_', ' ')} · {row.product_count} products
                    {!row.is_active && ' · inactive'}
                  </div>
                </td>
                <td className={`num${c.stock_out ? ' text-critical' : ''}`}>{c.stock_out}</td>
                <td className={`num${c.expired ? ' text-critical' : ''}`}>{c.expired}</td>
                <td className={`num${c.low_stock ? ' text-warning' : ''}`}>{c.low_stock}</td>
                <td className="num">{c.expiring_soon}</td>
                <td className="num">{row.needs_reorder_count}</td>
                <td>
                  {row.flagged_products.length === 0 ? (
                    <span className="muted small">All OK</span>
                  ) : (
                    <ul className="flag-list">
                      {row.flagged_products.map((p) => (
                        <li key={p.product.id}>
                          <span className="flag-product" title={p.product.name}>
                            {p.product.sku}
                          </span>
                          <span className="muted small">{formatQty(p.usable_quantity)} usable</span>
                          <LevelBadge level={p.level} />
                          <FlagBadges flags={p.flags.filter((f) => f === 'expired' || f === 'expiring_soon')} />
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
