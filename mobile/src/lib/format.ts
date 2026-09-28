import type { AlertType, ExpiryStatus, StockLevel, TransactionType, UserRole } from './types';

// Labels and rules mirror web/src/lib/format.ts and App\Enums\TransactionType.

export const TRANSACTION_TYPES: { value: TransactionType; label: string; hint: string }[] = [
  { value: 'issue', label: 'Issue', hint: 'To a ward or patient' },
  { value: 'receipt', label: 'Receipt', hint: 'Delivery received' },
  { value: 'loss', label: 'Loss', hint: 'Damaged, expired, missing' },
  { value: 'physical_count', label: 'Count', hint: 'Set to counted quantity' },
  { value: 'adjustment_in', label: 'Adjust +', hint: 'Correction up' },
  { value: 'adjustment_out', label: 'Adjust −', hint: 'Correction down' },
  { value: 'transfer_in', label: 'Transfer in', hint: 'From another facility' },
  { value: 'transfer_out', label: 'Transfer out', hint: 'To another facility' },
];

export const transactionLabel = (t: TransactionType) => TRANSACTION_TYPES.find((x) => x.value === t)?.label ?? t;

export const INBOUND: readonly TransactionType[] = ['receipt', 'transfer_in', 'adjustment_in'];
export const OUTBOUND: readonly TransactionType[] = ['issue', 'loss', 'transfer_out', 'adjustment_out'];
export const NEEDS_COUNTERPARTY: readonly TransactionType[] = ['receipt', 'issue', 'transfer_in', 'transfer_out'];

export const counterpartyLabel = (t: TransactionType) => (INBOUND.includes(t) ? 'Received from' : 'Issued to');

export const LEVEL_LABEL: Record<StockLevel, string> = {
  stock_out: 'Stock-out',
  low_stock: 'Low stock',
  reorder: 'Reorder',
  ok: 'OK',
};

export const FLAG_LABEL: Record<AlertType, string> = {
  stock_out: 'Stock-out',
  expired: 'Expired stock',
  low_stock: 'Low stock',
  expiring_soon: 'Expiring soon',
};

export const ALERT_TITLE: Record<AlertType, string> = {
  stock_out: 'Stock-out',
  expired: 'Expired batch',
  low_stock: 'Low stock',
  expiring_soon: 'Batch expiring soon',
};

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  ok: 'OK',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  sdp_staff: 'Facility staff',
  lga_officer: 'LGA officer',
  state_officer: 'State officer',
  federal_officer: 'Federal officer',
  admin: 'Administrator',
};

/** Today in Nigeria, YYYY-MM-DD — the backend's business timezone. */
export function todayInLagos(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** '2026-09-26' -> '26 Sept 2026' */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—';
}

export function formatShortDate(iso: string): string {
  return shortFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

export const formatQty = (n: number) => n.toLocaleString('en-NG');

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
