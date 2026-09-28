import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LEVEL_LABEL, formatQty } from '../../lib/format'
import type { ProductStock, StockLevel } from '../../lib/types'
import { AXIS_TICK, LEVEL_COLOR } from '../../lib/chart-theme'
import { ChartTooltip } from './ChartTooltip'

interface Row {
  name: string
  sku: string
  pct: number
  usable: number
  max: number
  unit: string
  level: StockLevel
}

/**
 * Usable stock as a share of each product's max stock level — a display-only
 * projection over the server's usable_quantity (never written back). Products
 * are in different units, so percent-of-max is what makes them comparable.
 */
export function StockPositionChart({ stock, limit = 10 }: { stock: ProductStock[]; limit?: number }) {
  const rows: Row[] = stock
    .filter((s) => s.product.max_stock_level > 0)
    .map((s) => ({
      name: s.product.name,
      sku: s.product.sku,
      pct: Math.round((s.usable_quantity / s.product.max_stock_level) * 100),
      usable: s.usable_quantity,
      max: s.product.max_stock_level,
      unit: s.product.unit_of_measure,
      level: s.level,
    }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, limit)

  if (rows.length === 0) return <div className="chart-empty">No stock recorded yet.</div>

  const levels = (Object.keys(LEVEL_COLOR) as StockLevel[]).filter((l) => rows.some((r) => r.level === l))

  return (
    <>
      <ul className="chart-legend" style={{ marginBottom: '0.75rem' }}>
        {levels.map((l) => (
          <li key={l}>
            <span className="swatch" style={{ background: LEVEL_COLOR[l] }} aria-hidden />
            {LEVEL_LABEL[l]}
          </li>
        ))}
      </ul>
      <div className="chart-box" style={{ height: Math.max(180, rows.length * 34 + 40) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis
              type="number"
              domain={[0, (max: number) => Math.max(100, Math.ceil(max / 25) * 25)]}
              tickFormatter={(v: number) => `${v}%`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="sku" width={92} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <ReferenceLine x={100} stroke="var(--chart-axis)" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ fill: 'var(--primary-soft)', opacity: 0.6 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined
                if (!active || !r) return null
                return (
                  <ChartTooltip
                    title={r.name}
                    rows={[
                      { label: 'Usable', value: `${formatQty(r.usable)} ${r.unit}`, color: LEVEL_COLOR[r.level] },
                      { label: 'Max level', value: formatQty(r.max) },
                      { label: 'Of max', value: `${r.pct}%` },
                      { label: 'Status', value: LEVEL_LABEL[r.level] },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.sku} fill={LEVEL_COLOR[r.level]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
