import type { FacilityStatusCounts, StockLevel } from './types'

// Chart colours are CSS variables (index.css) so light/dark modes swap in one place.

/** Status colours for stock levels — reserved for state, always shown with a label. */
export const LEVEL_COLOR: Record<StockLevel, string> = {
  stock_out: 'var(--status-critical)',
  low_stock: 'var(--status-warning)',
  reorder: 'var(--status-notice)',
  ok: 'var(--status-ok)',
}

export const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 12 }

const FACILITY_STATUS: { key: keyof FacilityStatusCounts; label: string; color: string }[] = [
  { key: 'stock_out', label: 'Has a stock-out', color: 'var(--status-critical)' },
  { key: 'low_stock', label: 'Low stock', color: 'var(--status-warning)' },
  { key: 'reorder', label: 'Needs reorder / expired', color: 'var(--status-notice)' },
  { key: 'ok', label: 'All OK', color: 'var(--status-ok)' },
  { key: 'no_data', label: 'Nothing recorded yet', color: 'var(--chart-3)' },
]

/** Donut slices for the server's facility_status counts (no_data only when present). */
export function facilityStatusSlices(status: FacilityStatusCounts) {
  return FACILITY_STATUS.filter((s) => s.key !== 'no_data' || status.no_data > 0).map((s) => ({
    ...s,
    value: status[s.key],
  }))
}
