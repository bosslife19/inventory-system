import { FLAG_LABEL } from '../../lib/format'
import type { AlertType, FlagCounts } from '../../lib/types'

interface Props {
  title: string
  subtitle?: string
  childCount: number
  childNoun: string
  /** How many children carry each flag. Same shape at LGA, State and Federal level. */
  counts: FlagCounts
}

const ORDER: { key: AlertType; tone: string }[] = [
  { key: 'stock_out', tone: 'critical' },
  { key: 'expired', tone: 'critical' },
  { key: 'low_stock', tone: 'warning' },
  { key: 'expiring_soon', tone: 'notice' },
]

/** Headline tiles for a rollup node — shared by the LGA, State and Federal views (web/CLAUDE.md rule 2). */
export function RollupSummaryCard({ title, subtitle, childCount, childNoun, counts }: Props) {
  return (
    <section className="rollup-summary">
      <div className="rollup-title">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-value">{childCount}</span>
          <span className="stat-label">{childNoun}</span>
        </div>
        {ORDER.map(({ key, tone }) => (
          <div key={key} className={`stat${counts[key] > 0 ? ` stat-${tone}` : ''}`}>
            <span className="stat-value">{counts[key]}</span>
            <span className="stat-label">
              {childNoun} with {FLAG_LABEL[key].toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
