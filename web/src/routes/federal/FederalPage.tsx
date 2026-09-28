import { Flag, Info, Landmark, Map as MapIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { KpiTile } from '../../components/ui/KpiTile'
import { AXIS_TICK } from '../../lib/chart-theme'
import { ZONE_LABEL } from '../../lib/format'
import { useStates } from '../../lib/queries'

/** National level. The Federal rollup is Phase 3; for now, an overview of coverage and drill-down by state. */
export function FederalPage() {
  const states = useStates()

  if (states.isPending) return <Loading />
  if (states.isError) return <ErrorState error={states.error} />

  const byZone = Object.entries(ZONE_LABEL).map(([zone, label]) => ({
    label,
    states: states.data.filter((s) => s.geopolitical_zone === zone),
  }))
  const chartData = byZone.map((z) => ({ zone: z.label, states: z.states.length }))

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">National overview</p>
          <h1>Nigeria</h1>
          <p className="muted">Every state and the FCT, grouped by geopolitical zone.</p>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiTile tone="primary" icon={Flag} label="States incl. FCT" value={states.data.length} />
        <KpiTile tone="dark" icon={MapIcon} label="Geopolitical zones" value={byZone.length} />
        <KpiTile icon={Landmark} label="Largest zone" value={[...chartData].sort((a, b) => b.states - a.states)[0]?.zone ?? '—'} />
      </div>

      <div className="grid-chart">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>States per zone</h2>
              <p>Coverage of the national hierarchy</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 16, right: 4, bottom: 0, left: -24 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="zone" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} interval={0} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--primary-soft)', opacity: 0.6 }}
                  content={({ active, payload }) => {
                    const r = payload?.[0]?.payload as (typeof chartData)[number] | undefined
                    if (!active || !r) return null
                    return <ChartTooltip title={r.zone} rows={[{ label: 'States', value: r.states, color: 'var(--chart-1)' }]} />
                  }}
                />
                <Bar
                  dataKey="states"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={false}
                  label={{ position: 'top', fill: 'var(--text-2)', fontSize: 12 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <div className="callout" style={{ alignSelf: 'start' }}>
          <Info size={18} />
          <span>
            National stock charts — stock-outs, expiries and reorder needs ranked worst-first by state — arrive with the
            Federal rollup (roadmap Phase 3). Choose a state below to drill down to its LGAs and facilities.
          </span>
        </div>
      </div>

      <div className="zone-grid">
        {byZone.map((z) => (
          <section key={z.label} className="card zone-card">
            <h2>
              {z.label}
              <span className="badge badge-notice badge-plain">{z.states.length} states</span>
            </h2>
            <ul className="pill-list">
              {z.states.map((s) => (
                <li key={s.id}>
                  <Link to={`/states/${s.id}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
