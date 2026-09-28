import type { AlertType, ExpiryStatus, StockLevel, TransactionType, UserRole } from './types'

export const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'issue', label: 'Issue' },
  { value: 'loss', label: 'Loss' },
  { value: 'adjustment_in', label: 'Adjustment (+)' },
  { value: 'adjustment_out', label: 'Adjustment (−)' },
  { value: 'physical_count', label: 'Physical count' },
  { value: 'transfer_in', label: 'Transfer in' },
  { value: 'transfer_out', label: 'Transfer out' },
]

export const transactionLabel = (t: TransactionType) =>
  TRANSACTION_TYPES.find((x) => x.value === t)?.label ?? t

// Mirrors App\Enums\TransactionType on the backend.
export const INBOUND: readonly TransactionType[] = ['receipt', 'transfer_in', 'adjustment_in']
export const OUTBOUND: readonly TransactionType[] = ['issue', 'loss', 'transfer_out', 'adjustment_out']
export const NEEDS_COUNTERPARTY: readonly TransactionType[] = ['receipt', 'issue', 'transfer_in', 'transfer_out']

export function counterpartyLabel(t: TransactionType): string {
  return INBOUND.includes(t) ? 'Received from' : 'Issued to'
}

export const LEVEL_LABEL: Record<StockLevel, string> = {
  stock_out: 'Stock-out',
  low_stock: 'Low stock',
  reorder: 'Reorder',
  ok: 'OK',
}

export const FLAG_LABEL: Record<AlertType, string> = {
  stock_out: 'Stock-out',
  expired: 'Expired stock',
  low_stock: 'Low stock',
  expiring_soon: 'Expiring soon',
}

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  ok: 'OK',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
}

export const ZONE_LABEL: Record<string, string> = {
  north_central: 'North Central',
  north_east: 'North East',
  north_west: 'North West',
  south_east: 'South East',
  south_south: 'South South',
  south_west: 'South West',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  sdp_staff: 'Facility staff',
  lga_officer: 'LGA officer',
  state_officer: 'State officer',
  federal_officer: 'Federal officer',
  admin: 'Administrator',
}

/** Today's date in Nigeria, YYYY-MM-DD — matches the backend's business timezone. */
export function todayInLagos(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** '2026-09-26' -> '26 Sept 2026' */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : '—'
}

export const formatQty = (n: number) => n.toLocaleString('en-NG')
