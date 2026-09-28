import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FLAG_LABEL } from '../../lib/format'
import type { AlertType, FacilityStockSummary } from '../../lib/types'
import { AXIS_TICK } from '../../lib/chart-theme'
import { ChartTooltip } from './ChartTooltip'

const FLAGS: { key: AlertType; color: string }[] = [
  { key: 'stock_out', color: 'var(--status-critical)' },
  { key: 'expired', color: 'var(--chart-2)' },
  { key: 'low_stock', color: 'var(--status-warning)' },
  { key: 'expiring_soon', color: 'var(--chart-1)' },
]

/** Flagged products per facility, stacked by flag — the worst facilities rise to the top. */
export function FacilityFlagsChart({ rows, limit = 8 }: { rows: FacilityStockSummary[]; limit?: number }) {
  const data = rows
    .map((r) => ({ name: r.name, ...r.flag_counts, total: FLAGS.reduce((n, f) => n + r.flag_counts[f.key], 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)

  if (data.length === 0) return <div className="chart-empty">No flagged products in any facility.</div>

  return (
    <>
      <ul className="chart-legend" style={{ marginBottom: '0.75rem' }}>
        {FLAGS.map((f) => (
          <li key={f.key}>
            <span className="swatch" style={{ background: f.color }} aria-hidden />
            {FLAG_LABEL[f.key]}
          </li>
        ))}
      </ul>
      <div className="chart-box" style={{ height: Math.max(180, data.length * 38 + 40) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="26%">
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(n: string) => (n.length > 20 ? `${n.slice(0, 19)}…` : n)}
            />
            <Tooltip
              cursor={{ fill: 'var(--primary-soft)', opacity: 0.6 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !r) return null
                return (
                  <ChartTooltip
                    title={r.name}
                    rows={FLAGS.map((f) => ({ label: FLAG_LABEL[f.key], value: r[f.key], color: f.color }))}
                  />
                )
              }}
            />
            {FLAGS.map((f, i) => (
              <Bar
                key={f.key}
                dataKey={f.key}
                stackId="flags"
                fill={f.color}
                stroke="var(--surface)"
                strokeWidth={1}
                radius={i === FLAGS.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
