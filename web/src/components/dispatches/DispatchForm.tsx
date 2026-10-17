import { AlertCircle, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDate, formatQty, todayInLagos } from '../../lib/format'
import { useCreateDispatch, useDispatchDestinations, useFulfilReorderRequest } from '../../lib/queries'
import type { DeliveryNote, Facility, ProductStock, ReorderRequest } from '../../lib/types'
import { Field } from '../form/Field'
import { Loading } from '../layout/PageState'

interface Line {
  key: number
  productId: number | ''
  batchNo: string
  quantity: string
}

type Errors = Record<string, string | undefined>

let nextKey = 1
const blankLine = (): Line => ({ key: nextKey++, productId: '', batchNo: '', quantity: '' })

/** Batches that can go out: in stock and not expired, earliest expiry first (FEFO) — as the API returns them. */
const issuable = (s: ProductStock | undefined) =>
  s?.batches.filter((b) => b.batch_no && b.quantity_on_hand > 0 && b.expiry_status !== 'expired') ?? []

function destinationLabel(f: Facility): string {
  if (f.store_level === 'state') return f.name
  if (f.store_level === 'lga') return f.name
  return f.lga ? `${f.name} · ${f.lga.name}` : f.name
}

interface Props {
  facilityId: number
  stock: ProductStock[]
  /** Fulfil this reorder request: the destination is the requester, lines start from what was asked. */
  request?: ReorderRequest
  onDone: (note: DeliveryNote) => void
  /** Instead of onDone when fulfilling a request. */
  onFulfilled?: (request: ReorderRequest) => void
  onCancel: () => void
}

/** A request's lines, as far as the store holds them: earliest-expiry batch, at most what's on hand. */
function linesFor(request: ReorderRequest, available: ProductStock[]): Line[] {
  const lines = request.items.flatMap((item) => {
    const s = available.find((x) => x.product.id === item.product.id)
    if (!s) return []
    const batch = issuable(s)[0]
    const onHand = s.product.requires_batch_tracking ? (batch?.quantity_on_hand ?? 0) : s.usable_quantity
    return [{ key: nextKey++, productId: s.product.id, batchNo: batch?.batch_no ?? '', quantity: String(Math.min(item.quantity_requested, onHand)) }]
  })
  return lines.length ? lines : [blankLine()]
}

/**
 * Issue stock from a store to a facility below it — one level down, or to
 * whoever sent a reorder request, however far down. Each line leaves this
 * Stock Card as an issue straight away; the receiver confirms the delivery
 * before it lands on theirs. Client checks mirror the API's.
 */
export function DispatchForm({ facilityId, stock, request, onDone, onFulfilled, onCancel }: Props) {
  const destinations = useDispatchDestinations(facilityId)
  const dispatch = useCreateDispatch(facilityId)
  const fulfil = useFulfilReorderRequest(facilityId)
  const saving = request ? fulfil : dispatch
  // Only what the store can actually send.
  const available = useMemo(
    () => stock.filter((s) => s.usable_quantity > 0).sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [stock],
  )
  const [destinationId, setDestinationId] = useState<number | ''>(request?.facility.id ?? '')
  const [date, setDate] = useState(todayInLagos())
  const [voucher, setVoucher] = useState('')
  const [comments, setComments] = useState('')
  const [lines, setLines] = useState<Line[]>(() => (request ? linesFor(request, available) : [blankLine()]))
  const [errors, setErrors] = useState<Errors>({})
  const missing = request?.items.filter((i) => !available.some((s) => s.product.id === i.product.id)) ?? []
  const stockOf = (id: number | '') => available.find((s) => s.product.id === id)
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  /** On hand for the chosen batch, or the product's usable total if it isn't batch-tracked. */
  function onHand(l: Line): number | undefined {
    const s = stockOf(l.productId)
    if (!s) return undefined
    if (!s.product.requires_batch_tracking) return s.usable_quantity
    return issuable(s).find((b) => b.batch_no === l.batchNo)?.quantity_on_hand
  }

  function validate(): Errors {
    const e: Errors = {}
    if (!destinationId) e.destination_facility_id = 'Choose where it is going.'
    if (!date) e.dispatched_date = 'Choose a date.'
    lines.forEach((l, i) => {
      const s = stockOf(l.productId)
      if (!s) e[`items.${i}.product_id`] = 'Choose a product.'
      if (s?.product.requires_batch_tracking && !l.batchNo) e[`items.${i}.batch_no`] = 'Choose a batch.'
      const qty = Number(l.quantity)
      const max = onHand(l)
      if (!l.quantity || !Number.isInteger(qty) || qty < 1) e[`items.${i}.quantity`] = 'Whole number above 0.'
      else if (max !== undefined && qty > max) e[`items.${i}.quantity`] = `Only ${formatQty(max)} on hand.`
    })
    return e
  }

  function submit() {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const body = {
      dispatched_date: date,
      voucher_no: voucher.trim() || null,
      comments: comments.trim() || null,
      items: lines.map((l) => {
        const s = stockOf(l.productId)!
        return {
          product_id: s.product.id,
          batch_no: s.product.requires_batch_tracking ? l.batchNo : null,
          quantity: Number(l.quantity),
        }
      }),
    }
    const onError = (err: Error) => {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])))
      } else {
        setErrors({ form: err.message })
      }
    }

    if (request) {
      fulfil.mutate(
        { id: request.id, body },
        { onSuccess: (r) => onFulfilled?.(r), onError },
      )
    } else {
      dispatch.mutate({ ...body, destination_facility_id: destinationId as number }, { onSuccess: onDone, onError })
    }
  }

  if (destinations.isPending && !request) return <Loading />

  const general = Object.entries(errors).filter(
    ([k]) => !/^items\.\d+\./.test(k) && !['destination_facility_id', 'dispatched_date', 'voucher_no'].includes(k),
  )

  if (available.length === 0) {
    return (
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="empty" style={{ padding: 0 }}>
          {request
            ? 'None of what was asked for is in stock here. Decline the request, or receive stock first.'
            : 'Nothing in stock to issue yet. Record a receipt or confirm an incoming delivery first.'}
        </p>
        <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      <div className="field-row">
        {request ? (
          <Field label="Issue to" hint={`For ${request.number}`}>
            <input value={request.facility.name} readOnly />
          </Field>
        ) : (
        <Field label="Issue to" error={errors.destination_facility_id ?? (destinations.isError ? destinations.error.message : undefined)}>
          <select value={destinationId} onChange={(e) => setDestinationId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select…</option>
            {destinations.data?.some((d) => d.store_level) && (
              <optgroup label="Stores">
                {destinations.data
                  .filter((d) => d.store_level)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {destinationLabel(d)}
                    </option>
                  ))}
              </optgroup>
            )}
            {destinations.data?.some((d) => !d.store_level) && (
              <optgroup label="Facilities">
                {destinations.data
                  .filter((d) => !d.store_level)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {destinationLabel(d)}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </Field>
        )}
        <Field label="Date issued" error={errors.dispatched_date}>
          <input type="date" value={date} max={todayInLagos()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Voucher / waybill no. (optional)" hint="Generated if left blank" error={errors.voucher_no}>
          <input value={voucher} onChange={(e) => setVoucher(e.target.value)} />
        </Field>
      </div>

      {missing.length > 0 && (
        <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
          Not in stock here, so not on the list: {missing.map((i) => `${i.product.name} (${formatQty(i.quantity_requested)} asked)`).join(', ')}.
        </p>
      )}

      <div className="line-editor dispatch-lines">
        <div className="line-editor-head" aria-hidden>
          <span>Product</span>
          <span>Batch</span>
          <span>Quantity</span>
          <span />
        </div>
        {lines.map((l, i) => {
          const s = stockOf(l.productId)
          const tracked = s?.product.requires_batch_tracking ?? true
          const max = onHand(l)
          const err = (f: string) => errors[`items.${i}.${f}`]
          return (
            <div key={l.key} className="line-editor-row">
              <label className="line-cell">
                <span className="line-label">Product</span>
                <select
                  value={l.productId}
                  aria-invalid={err('product_id') ? true : undefined}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : ''
                    update(l.key, { productId: id, batchNo: issuable(stockOf(id))[0]?.batch_no ?? '' })
                  }}
                >
                  <option value="">Select…</option>
                  {available.map((p) => (
                    <option key={p.product.id} value={p.product.id}>
                      {p.product.name}
                    </option>
                  ))}
                </select>
                {err('product_id') && <span className="field-error">{err('product_id')}</span>}
              </label>
              <label className="line-cell">
                <span className="line-label">Batch</span>
                {tracked ? (
                  <select
                    value={l.batchNo}
                    disabled={!s}
                    aria-invalid={err('batch_no') ? true : undefined}
                    onChange={(e) => update(l.key, { batchNo: e.target.value })}
                  >
                    <option value="">{s ? 'Select…' : '—'}</option>
                    {issuable(s).map((b) => (
                      <option key={b.batch_id} value={b.batch_no!}>
                        {b.batch_no} · exp {formatDate(b.expiry_date)} · {formatQty(b.quantity_on_hand)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value="Not batch-tracked" readOnly />
                )}
                {err('batch_no') && <span className="field-error">{err('batch_no')}</span>}
              </label>
              <label className="line-cell">
                <span className="line-label">Quantity</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  step={1}
                  value={l.quantity}
                  aria-invalid={err('quantity') ? true : undefined}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                />
                {err('quantity') ? (
                  <span className="field-error">{err('quantity')}</span>
                ) : (
                  max !== undefined && (
                    <span className="muted small">
                      {formatQty(max)} {s?.product.unit_of_measure} on hand
                    </span>
                  )
                )}
              </label>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={`Remove line ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          <Plus size={15} /> Add line
        </button>
      </div>

      <Field label="Comments (optional)">
        <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Quarterly allocation" />
      </Field>

      {(errors.form || general.length > 0) && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} />
          {errors.form ?? general.map(([, v]) => v).join(' ')}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={saving.isPending} onClick={submit}>
          <Send size={16} /> {saving.isPending ? 'Issuing…' : request ? 'Send stock' : 'Issue stock'}
        </button>
      </div>
      <p className="muted small" style={{ margin: '0.5rem 0 0', textAlign: 'right' }}>
        Leaves this Stock Card now. It reaches the receiver’s card once they confirm the delivery.
      </p>
    </form>
  )
}
