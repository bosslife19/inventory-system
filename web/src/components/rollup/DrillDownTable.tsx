import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ZONE_LABEL, formatDate, formatQty } from '../../lib/format'
import type { AreaStockSummary, FacilityStockSummary, FlagCounts } from '../../lib/types'
import { FlagBadges, LevelBadge } from '../stock/StatusBadges'

type Row = FacilityStockSummary | AreaStockSummary

interface Props {
  /** Child rows from a stock-summary endpoint, already sorted worst-first by the API. */
  rows: Row[]
  hrefFor: (row: Row) => string
  childNoun: string
}

function CountCells({ c }: { c: FlagCounts }) {
  return (
    <>
      <td className={`num${c.stock_out ? ' text-critical' : ''}`}>{c.stock_out}</td>
      <td className={`num${c.expired ? ' text-critical' : ''}`}>{c.expired}</td>
      <td className={`num${c.low_stock ? ' text-warning' : ''}`}>{c.low_stock}</td>
      <td className="num hide-sm">{c.expiring_soon}</td>
    </>
  )
}

function FacilityDetail({ row }: { row: FacilityStockSummary }) {
  if (row.flagged_products.length === 0) return <span className="badge badge-ok">All OK</span>
  return (
    <ul className="flag-list">
      {row.flagged_products.slice(0, 4).map((p) => (
        <li key={p.product.id}>
          <span className="flag-product" title={p.product.name}>
            {p.product.sku}
          </span>
          <span className="muted small">{formatQty(p.usable_quantity)} usable</span>
          <LevelBadge level={p.level} />
          <FlagBadges flags={p.flags.filter((f) => f === 'expired' || f === 'expiring_soon')} />
        </li>
      ))}
      {row.flagged_products.length > 4 && <li className="muted small">+{row.flagged_products.length - 4} more</li>}
    </ul>
  )
}

function AreaDetail({ row }: { row: AreaStockSummary }) {
  if (row.reporting_facility_count === 0) return <span className="muted small">No data yet</span>
  if (row.stock_out_products.length === 0) return <span className="badge badge-ok">No stock-outs</span>
  return (
    <ul className="flag-list">
      {row.stock_out_products.map((p) => (
        <li key={p.product.id}>
          <span className="flag-product" title={p.product.name}>
            {p.product.sku}
          </span>
          <span className="badge badge-critical">
            out at {p.facility_count} {p.facility_count === 1 ? 'facility' : 'facilities'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Worst-first list of a rollup node's children — shared by the LGA, State and
 * Federal views. At LGA level the children are facilities (counts are
 * products); above it they are LGAs / States (counts are facilities).
 */
export function DrillDownTable({ rows, hrefFor, childNoun }: Props) {
  if (rows.length === 0) return <p className="empty">No {childNoun.toLowerCase()} match.</p>
  const areas = rows[0].level !== 'facility'

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{childNoun}</th>
            <th className="num" title={areas ? 'Facilities with a stock-out' : 'Products stocked out'}>
              Stock-outs
            </th>
            <th className="num">Expired</th>
            <th className="num">Low</th>
            <th className="num hide-sm">Expiring</th>
            <th className="num hide-sm">Need reorder</th>
            <th>{areas ? 'Most stocked-out products' : 'Flagged products'}</th>
            <th className="hide-sm">Last entry</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.flag_counts.stock_out > 0 ? 'row-critical' : undefined}>
              <td>
                <Link to={hrefFor(row)} className="cell-title">
                  {row.name}
                </Link>
                <div className="muted small" style={{ textTransform: row.level === 'facility' ? 'capitalize' : undefined }}>
                  {row.level === 'facility' ? (
                    <>
                      {row.type.replace('_', ' ')} · {row.product_count} products
                      {!row.is_active && ' · inactive'}
                    </>
                  ) : (
                    <>
                      {row.geopolitical_zone && `${ZONE_LABEL[row.geopolitical_zone] ?? row.geopolitical_zone} · `}
                      {row.facility_count} {row.facility_count === 1 ? 'facility' : 'facilities'}
                      {row.facility_count > 0 && ` · ${row.reporting_facility_count} reporting`}
                    </>
                  )}
                </div>
              </td>
              <CountCells c={row.flag_counts} />
              <td className="num hide-sm">{row.needs_reorder_count}</td>
              <td>{row.level === 'facility' ? <FacilityDetail row={row} /> : <AreaDetail row={row} />}</td>
              <td className="hide-sm nowrap small">
                {row.last_transaction_date ? formatDate(row.last_transaction_date) : <span className="muted">Never</span>}
              </td>
              <td className="actions">
                <Link to={hrefFor(row)} className="btn btn-icon" aria-label={`Open ${row.name}`}>
                  <ChevronRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
