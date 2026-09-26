import { EXPIRY_LABEL, FLAG_LABEL, LEVEL_LABEL } from '../../lib/format'
import type { AlertType, ExpiryStatus, StockLevel } from '../../lib/types'

const LEVEL_TONE: Record<StockLevel, string> = {
  stock_out: 'critical',
  low_stock: 'warning',
  reorder: 'notice',
  ok: 'ok',
}

const FLAG_TONE: Record<AlertType, string> = {
  stock_out: 'critical',
  expired: 'critical',
  low_stock: 'warning',
  expiring_soon: 'notice',
}

export function LevelBadge({ level }: { level: StockLevel }) {
  return <span className={`badge badge-${LEVEL_TONE[level]}`}>{LEVEL_LABEL[level]}</span>
}

export function FlagBadges({ flags }: { flags: AlertType[] }) {
  if (flags.length === 0) return null
  return (
    <span className="badge-row">
      {flags.map((f) => (
        <span key={f} className={`badge badge-outline badge-${FLAG_TONE[f]}`}>
          {FLAG_LABEL[f]}
        </span>
      ))}
    </span>
  )
}

export function ExpiryBadge({ status }: { status: ExpiryStatus | null }) {
  if (!status || status === 'ok') return null
  return (
    <span className={`badge badge-outline badge-${status === 'expired' ? 'critical' : 'notice'}`}>
      {EXPIRY_LABEL[status]}
    </span>
  )
}
