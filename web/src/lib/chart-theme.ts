import type { StockLevel } from './types'

// Chart colours are CSS variables (index.css) so light/dark modes swap in one place.

/** Status colours for stock levels — reserved for state, always shown with a label. */
export const LEVEL_COLOR: Record<StockLevel, string> = {
  stock_out: 'var(--status-critical)',
  low_stock: 'var(--status-warning)',
  reorder: 'var(--status-notice)',
  ok: 'var(--status-ok)',
}

export const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 12 }
