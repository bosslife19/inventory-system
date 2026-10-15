import { AlertCircle, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDate, formatQty, todayInLagos } from '../../lib/format'
import { useCreateDispatch, useDispatchDestinations } from '../../lib/queries'
import type { DeliveryNote, Facility, ProductStock } from '../../lib/types'
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
  onDone: (note: DeliveryNote) => void
  onCancel: () => void
}

/**
 * Issue stock from a store to a facility one level down. Each line leaves
 * this Stock Card as an issue straight away; the receiver confirms the
 * delivery before it lands on theirs. Client checks mirror the API's.
 */
export function DispatchForm({ facilityId, stock, onDone, onCancel }: Props) {
  const destinations = useDispatchDestinations(facilityId)
  const dispatch = useCreateDispatch(facilityId)
  const [destinationId, setDestinationId] = useState<number | ''>('')
  const [date, setDate] = useState(todayInLagos())
  const [voucher, setVoucher] = useState('')
  const [comments, setComments] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [errors, setErrors] = useState<Errors>({})

  // Only what the store can actually send.
  const available = useMemo(
    () => stock.filter((s) => s.usable_quantity > 0).sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [stock],
  )
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

    dispatch.mutate(
      {
        destination_facility_id: destinationId as number,
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
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiError && err.status === 422) {
            setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])))
          } else {
            setErrors({ form: err.message })
          }
        },
      },
    )
  }

  if (destinations.isPending) return <Loading />

  const general = Object.entries(errors).filter(
    ([k]) => !/^items\.\d+\./.test(k) && !['destination_facility_id', 'dispatched_date', 'voucher_no'].includes(k),
  )

  if (available.length === 0) {
    return (
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="empty" style={{ padding: 0 }}>
          Nothing in stock to issue yet. Record a receipt or confirm an incoming delivery first.
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
        <Field label="Date issued" error={errors.dispatched_date}>
          <input type="date" value={date} max={todayInLagos()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Voucher / waybill no. (optional)" hint="Generated if left blank" error={errors.voucher_no}>
          <input value={voucher} onChange={(e) => setVoucher(e.target.value)} />
        </Field>
      </div>

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
        <button type="button" className="btn btn-primary" disabled={dispatch.isPending} onClick={submit}>
          <Send size={16} /> {dispatch.isPending ? 'Issuing…' : 'Issue stock'}
        </button>
      </div>
      <p className="muted small" style={{ margin: '0.5rem 0 0', textAlign: 'right' }}>
        Leaves this Stock Card now. It reaches the receiver’s card once they confirm the delivery.
      </p>
    </form>
  )
}
