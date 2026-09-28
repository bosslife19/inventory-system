import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltip } from './ChartTooltip'

export interface DonutSlice {
  key: string
  label: string
  value: number
  /** A status colour token — slices here are stock states, never arbitrary series. */
  color: string
}

interface Props {
  slices: DonutSlice[]
  centerValue: React.ReactNode
  centerLabel: string
}

/**
 * Share-of-total by stock status. The list beside the ring names every slice
 * with its count and percentage, so colour never carries meaning alone.
 */
export function StatusDonut({ slices, centerValue, centerLabel }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const shown = slices.filter((s) => s.value > 0)

  return (
    <div className="donut-wrap">
      <div className="donut">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={shown.length ? shown : [{ key: 'none', label: 'None', value: 1, color: 'var(--chart-grid)' }]}
              dataKey="value"
              nameKey="label"
              innerRadius={62}
              outerRadius={86}
              paddingAngle={shown.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {(shown.length ? shown : [{ key: 'none', color: 'var(--chart-grid)' }]).map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            {shown.length > 0 && (
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as DonutSlice | undefined
                  if (!active || !p) return null
                  return (
                    <ChartTooltip
                      title={p.label}
                      rows={[{ label: 'Count', value: `${p.value} (${Math.round((p.value / total) * 100)}%)`, color: p.color }]}
                    />
                  )
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-list">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} aria-hidden />
            <span>{s.label}</span>
            <span className="count">
              {s.value}
              <span className="pct">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
