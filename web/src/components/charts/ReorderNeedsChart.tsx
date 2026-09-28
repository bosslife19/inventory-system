import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProductRollup } from '../../lib/types'
import { AXIS_TICK } from '../../lib/chart-theme'
import { ChartTooltip } from './ChartTooltip'

/** How many child nodes need to reorder each product — the consolidated reorder picture. Single series, one colour. */
export function ReorderNeedsChart({ rows, childNoun, limit = 8 }: { rows: ProductRollup[]; childNoun: string; limit?: number }) {
  const data = rows
    .filter((r) => r.facilities_needing_reorder > 0)
    .sort((a, b) => b.facilities_needing_reorder - a.facilities_needing_reorder)
    .slice(0, limit)
    .map((r) => ({ sku: r.product.sku, name: r.product.name, value: r.facilities_needing_reorder }))

  if (data.length === 0) return <div className="chart-empty">No product is at or below its reorder level.</div>

  return (
    <div className="chart-box" style={{ height: Math.max(180, data.length * 36 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="sku" width={92} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--primary-soft)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!active || !r) return null
              return (
                <ChartTooltip title={r.name} rows={[{ label: `${childNoun} needing reorder`, value: r.value, color: 'var(--chart-1)' }]} />
              )
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
            label={{ position: 'right', fill: 'var(--text-2)', fontSize: 12 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
