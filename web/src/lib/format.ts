import type { AlertType, ExpiryStatus, Product, StockLevel, TransactionType, UnitOfMeasure, UserRole } from './types'

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

// The EOP (emergency order point) sits below the minimum: at or below it the
// low-stock alert fires; between it and the minimum it's simply time to order.
export const LEVEL_LABEL: Record<StockLevel, string> = {
  stock_out: 'Stock-out',
  low_stock: 'At EOP',
  reorder: 'Below min',
  ok: 'OK',
}

export const FLAG_LABEL: Record<AlertType, string> = {
  stock_out: 'Stock-out',
  expired: 'Expired stock',
  low_stock: 'At EOP',
  expiring_soon: 'Expiring soon',
}

export const ALERT_TITLE: Record<AlertType, string> = {
  stock_out: 'Stock-out',
  expired: 'Expired batch',
  low_stock: 'Reached the EOP',
  expiring_soon: 'Batch expiring soon',
}

// Mirrors App\Enums\UnitOfMeasure. Containers say how many pieces each one holds.
export const UNITS: { value: UnitOfMeasure; label: string; plural: string; container?: true }[] = [
  { value: 'piece', label: 'Piece', plural: 'pieces' },
  { value: 'tablet', label: 'Tablet', plural: 'tablets' },
  { value: 'capsule', label: 'Capsule', plural: 'capsules' },
  { value: 'sachet', label: 'Sachet', plural: 'sachets' },
  { value: 'ampoule', label: 'Ampoule', plural: 'ampoules' },
  { value: 'vial', label: 'Vial', plural: 'vials' },
  { value: 'bottle', label: 'Bottle', plural: 'bottles' },
  { value: 'tube', label: 'Tube', plural: 'tubes' },
  { value: 'pair', label: 'Pair', plural: 'pairs' },
  { value: 'roll', label: 'Roll', plural: 'rolls' },
  { value: 'pack', label: 'Pack', plural: 'packs', container: true },
  { value: 'box', label: 'Box', plural: 'boxes', container: true },
  { value: 'carton', label: 'Carton', plural: 'cartons', container: true },
  { value: 'bag', label: 'Bag', plural: 'bags', container: true },
  { value: 'kit', label: 'Kit', plural: 'kits', container: true },
]

export const isContainerUnit = (u: UnitOfMeasure | '') => UNITS.some((x) => x.value === u && x.container)

/** 'sachets', 'boxes' */
export const unitPlural = (u: UnitOfMeasure) => UNITS.find((x) => x.value === u)?.plural ?? u

/** '60 sachets', '1 box' */
export const quantityWithUnit = (n: number, u: UnitOfMeasure) => `${formatQty(n)} ${n === 1 ? u : unitPlural(u)}`

/** 'pack of 10' / 'sachet' — what one unit on the Stock Card is. */
export function unitDescription(p: Pick<Product, 'unit_of_measure' | 'pack_size'>): string {
  return p.pack_size ? `${p.unit_of_measure} of ${formatQty(p.pack_size)}` : p.unit_of_measure
}

const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })

/** '2026-09-26T10:00:00Z' -> '2 days ago' */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
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
