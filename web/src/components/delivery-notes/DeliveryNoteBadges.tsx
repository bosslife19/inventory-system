import { Keyboard, ScanLine } from 'lucide-react'
import type { DeliveryNote, DeliveryNoteStatus } from '../../lib/types'

const STATUS: Record<DeliveryNoteStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'neutral' },
}

export function DeliveryStatusBadge({ status }: { status: DeliveryNoteStatus }) {
  return <span className={`badge badge-${STATUS[status].tone}`}>{STATUS[status].label}</span>
}

/** How the lines were captured — read from a photo on a phone and reviewed, or typed in. */
export function CaptureBadge({ method }: { method: DeliveryNote['capture_method'] }) {
  return method === 'ocr' ? (
    <span className="badge badge-notice badge-plain" title="Read from a photo on the phone, then reviewed by staff">
      <ScanLine size={12} /> Scanned
    </span>
  ) : (
    <span className="badge badge-neutral badge-plain">
      <Keyboard size={12} /> Typed
    </span>
  )
}
