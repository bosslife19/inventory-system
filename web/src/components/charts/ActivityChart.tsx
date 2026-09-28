import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate } from '../../lib/format'
import type { ActivityWeek } from '../../lib/types'
import { AXIS_TICK } from '../../lib/chart-theme'
import { ChartTooltip } from './ChartTooltip'

const ACTIVITY_SERIES = [
  { key: 'received', label: 'Received', color: 'var(--chart-1)' },
  { key: 'issued', label: 'Issued', color: 'var(--chart-2)' },
  { key: 'other', label: 'Losses, adjustments & counts', color: 'var(--chart-3)' },
] as const

const shortWeek = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Stock Card entries per week, stacked by kind. Counts entries, not quantities —
 * units differ across products and don't add up.
 */
export function ActivityChart({ weeks }: { weeks: ActivityWeek[] }) {
  const empty = weeks.every((w) => w.received + w.issued + w.other === 0)

  return (
    <>
      <ul className="chart-legend" style={{ marginBottom: '0.75rem' }}>
        {ACTIVITY_SERIES.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="chart-box">
        {empty ? (
          <div className="chart-empty">No Stock Card entries in this period.</div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="week_start"
                tickFormatter={(d: string) => shortWeek.format(new Date(`${d}T00:00:00Z`))}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                cursor={{ fill: 'var(--primary-soft)', opacity: 0.6 }}
                content={({ active, payload }) => {
                  const w = payload?.[0]?.payload as ActivityWeek | undefined
                  if (!active || !w) return null
                  return (
                    <ChartTooltip
                      title={`Week of ${formatDate(w.week_start)}`}
                      rows={ACTIVITY_SERIES.map((s) => ({ label: s.label, value: w[s.key], color: s.color }))}
                    />
                  )
                }}
              />
              {ACTIVITY_SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="entries"
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1}
                  radius={i === ACTIVITY_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}
