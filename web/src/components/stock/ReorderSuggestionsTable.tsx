import { useState } from 'react'
import { formatQty } from '../../lib/format'
import type { ReorderSuggestion } from '../../lib/types'
import { LevelBadge } from './StatusBadges'

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * The Excel Bin Card summary: AMC, months of stock and quantity to order per
 * product. Every figure comes from GET /reorder-suggestions — nothing is
 * derived here (web/CLAUDE.md rule 4).
 */
export function ReorderSuggestionsTable({ rows }: { rows: ReorderSuggestion[] }) {
  const [onlyToOrder, setOnlyToOrder] = useState(true)
  const toOrder = rows.filter((r) => r.suggested_quantity > 0)
  const shown = onlyToOrder ? toOrder : rows
  const period = rows.find((r) => r.amc_period_month)?.amc_period_month

  return (
    <>
      <div className="card-head">
        <div>
          <h2>Reorder suggestions</h2>
          <p>
            {toOrder.length} of {rows.length} products to order · AMC
            {period ? ` as of ${monthFmt.format(new Date(`${period}T00:00:00Z`))}` : ' not computed yet'}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Show">
          <button type="button" aria-pressed={onlyToOrder} onClick={() => setOnlyToOrder(true)}>
            To order
          </button>
          <button type="button" aria-pressed={!onlyToOrder} onClick={() => setOnlyToOrder(false)}>
            All products
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nothing to order — every product is at or above its max level.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Usable</th>
                <th className="num" title="Average Monthly Consumption (issues per month)">
                  AMC
                </th>
                <th className="num">Months of stock</th>
                <th className="num hide-sm">Max stock</th>
                <th className="num">Quantity to order</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.product.id}>
                  <td>
                    <div className="cell-title">{r.product.name}</div>
                    <div className="muted small">
                      {r.product.sku} · {r.product.unit_of_measure}
                    </div>
                  </td>
                  <td className="num">
                    <div>{formatQty(r.usable_quantity)}</div>
                    <LevelBadge level={r.level} />
                  </td>
                  <td className="num">
                    {r.amc_quantity === null ? (
                      <span className="muted small">No history yet</span>
                    ) : (
                      <>
                        {formatQty(r.amc_quantity)}
                        <div className="muted small">
                          over {r.amc_months_used} month{r.amc_months_used === 1 ? '' : 's'}
                        </div>
                      </>
                    )}
                  </td>
                  <td className={`num${r.months_of_stock !== null && r.months_of_stock < 1 ? ' text-critical' : ''}`}>
                    {r.months_of_stock === null ? '—' : r.months_of_stock.toFixed(1)}
                  </td>
                  <td className="num hide-sm">
                    {formatQty(r.max_stock_quantity)}
                    <div className="muted small">{r.basis === 'amc' ? 'from AMC' : 'product max level'}</div>
                  </td>
                  <td className="num">
                    <strong className={r.suggested_quantity > 0 ? 'order-qty' : 'muted'}>
                      {formatQty(r.suggested_quantity)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
