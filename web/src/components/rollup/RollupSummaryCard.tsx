import { AlertOctagon, Building2, CalendarClock, PackageX, TrendingDown } from 'lucide-react'
import type { FlagCounts } from '../../lib/types'
import { KpiTile } from '../ui/KpiTile'

interface Props {
  title: string
  subtitle?: string
  eyebrow?: string
  back?: React.ReactNode
  childCount: number
  childNoun: string
  /** How many children carry each flag. Same shape at LGA, State and Federal level. */
  counts: FlagCounts
}

/** Page header + headline tiles for a rollup node — shared by the LGA, State and Federal views (web/CLAUDE.md rule 2). */
export function RollupSummaryCard({ title, subtitle, eyebrow, back, childCount, childNoun, counts }: Props) {
  const noun = childNoun.toLowerCase()
  const share = (n: number) => (childCount ? `${Math.round((n / childCount) * 100)}% of ${noun}` : undefined)

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          {back}
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </header>
      <div className="kpi-grid">
        <KpiTile tone="primary" icon={Building2} label={childNoun} value={childCount} sub="Reporting to this dashboard" />
        <KpiTile
          tone={counts.stock_out ? 'critical' : 'default'}
          icon={PackageX}
          label="With a stock-out"
          value={counts.stock_out}
          sub={share(counts.stock_out)}
        />
        <KpiTile
          tone={counts.low_stock ? 'warning' : 'default'}
          icon={TrendingDown}
          label="With low stock"
          value={counts.low_stock}
          sub={share(counts.low_stock)}
        />
        <KpiTile tone="dark" icon={AlertOctagon} label="Holding expired stock" value={counts.expired} sub={share(counts.expired)} />
        <KpiTile icon={CalendarClock} label="With stock expiring soon" value={counts.expiring_soon} sub={share(counts.expiring_soon)} />
      </div>
    </section>
  )
}
