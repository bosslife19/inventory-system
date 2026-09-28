import type { LucideIcon } from 'lucide-react'

export type KpiTone = 'default' | 'primary' | 'dark' | 'critical' | 'warning'

interface Props {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: LucideIcon
  tone?: KpiTone
}

/** Headline number with its label — the "overview" row at the top of every dashboard. */
export function KpiTile({ label, value, sub, icon: Icon, tone = 'default' }: Props) {
  return (
    <div className={`kpi${tone === 'default' ? '' : ` kpi-${tone}`}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-icon" aria-hidden>
        <Icon size={20} />
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  )
}
