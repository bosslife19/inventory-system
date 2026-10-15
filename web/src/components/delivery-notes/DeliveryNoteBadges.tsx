import { Keyboard, ScanLine, Warehouse } from 'lucide-react'
import type { DeliveryNote, DeliveryNoteStatus } from '../../lib/types'

const STATUS: Record<DeliveryNoteStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'neutral' },
}

export function DeliveryStatusBadge({ status }: { status: DeliveryNoteStatus }) {
  return <span className={`badge badge-${STATUS[status].tone}`}>{STATUS[status].label}</span>
}

/**
 * Where the lines came from — issued by a store in the system, read from a
 * photo on a phone and reviewed, or typed in.
 */
export function CaptureBadge({ note }: { note: Pick<DeliveryNote, 'capture_method' | 'source_facility'> }) {
  if (note.source_facility) {
    return (
      <span className="badge badge-notice badge-plain" title={`Issued by ${note.source_facility.name} in the system`}>
        <Warehouse size={12} /> Issued by store
      </span>
    )
  }
  return note.capture_method === 'ocr' ? (
    <span className="badge badge-notice badge-plain" title="Read from a photo on the phone, then reviewed by staff">
      <ScanLine size={12} /> Scanned
    </span>
  ) : (
    <span className="badge badge-neutral badge-plain">
      <Keyboard size={12} /> Typed
    </span>
  )
}
