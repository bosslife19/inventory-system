import { AlertCircle, Check, Plus, Save, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDate, todayInLagos } from '../../lib/format'
import { useCreateDeliveryNote } from '../../lib/queries'
import type { Product, ProductStock } from '../../lib/types'
import { Field } from '../form/Field'

interface Line {
  key: number
  productId: number | ''
  batchNo: string
  expiry: string
  quantity: string
}

type Errors = Record<string, string | undefined>

let nextKey = 1
const blankLine = (): Line => ({ key: nextKey++, productId: '', batchNo: '', expiry: '', quantity: '' })

interface Props {
  facilityId: number
  products: Product[]
  stock: ProductStock[]
  onDone: (message: string) => void
  onCancel: () => void
}

/**
 * Type in a delivery note by hand (the phone app can scan one instead).
 * "Save draft" keeps it off the ledger for someone to check; "Confirm
 * receipt" posts every line as a receipt straight away. Client checks
 * mirror the API's; the API is the real gate.
 */
export function DeliveryNoteForm({ facilityId, products, stock, onDone, onCancel }: Props) {
  const listId = useId()
  const create = useCreateDeliveryNote(facilityId)
  const [source, setSource] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [date, setDate] = useState(todayInLagos())
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [errors, setErrors] = useState<Errors>({})

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const byCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const p of products) groups.set(p.category, [...(groups.get(p.category) ?? []), p])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [products])

  const batchesOf = (productId: number | '') => stock.find((s) => s.product.id === productId)?.batches.filter((b) => b.batch_no) ?? []
  const knownBatch = (l: Line) => batchesOf(l.productId).find((b) => b.batch_no === l.batchNo.trim().toUpperCase())
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function validate(): Errors {
    const e: Errors = {}
    if (!source.trim()) e.source = 'Who delivered it? It becomes “Received from” on the Stock Card.'
    if (!date) e.received_date = 'Choose a date.'
    lines.forEach((l, i) => {
      const p = l.productId ? byId.get(l.productId) : undefined
      if (!p) e[`items.${i}.product_id`] = 'Choose a product.'
      const qty = Number(l.quantity)
      if (!l.quantity || !Number.isInteger(qty) || qty < 1) e[`items.${i}.quantity`] = 'Whole number above 0.'
      if (p?.requires_batch_tracking) {
        if (!l.batchNo.trim()) e[`items.${i}.batch_no`] = 'Batch is required.'
        else if (!knownBatch(l) && !l.expiry) e[`items.${i}.expiry_date`] = 'New batch: expiry required.'
      }
    })
    return e
  }

  function submit(confirm: boolean) {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    create.mutate(
      {
        source: source.trim(),
        delivery_note_no: noteNo.trim() || null,
        received_date: date,
        capture_method: 'manual',
        confirm,
        items: lines.map((l) => {
          const p = byId.get(l.productId as number)!
          const tracked = p.requires_batch_tracking
          return {
            product_id: p.id,
            quantity: Number(l.quantity),
            batch_no: tracked ? l.batchNo.trim().toUpperCase() : null,
            expiry_date: tracked && !knownBatch(l) ? l.expiry : null,
          }
        }),
      },
      {
        onSuccess: (note) =>
          onDone(
            confirm
              ? `Delivery from ${note.source} confirmed — ${note.items.length} receipt${note.items.length === 1 ? '' : 's'} added to the Stock Card.`
              : `Draft saved. Confirm it once the lines have been checked.`,
          ),
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

  // Errors the API returns for fields that aren't shown next to a line (e.g. status).
  const general = Object.entries(errors).filter(([k]) => !/^items\.\d+\./.test(k) && !['source', 'received_date'].includes(k))

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      <div className="field-row">
        <Field label="Received from" error={errors.source}>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Kaduna State CMS" />
        </Field>
        <Field label="Delivery note no. (optional)" hint="Saved as the voucher no." error={errors.delivery_note_no}>
          <input value={noteNo} onChange={(e) => setNoteNo(e.target.value)} />
        </Field>
        <Field label="Date received" error={errors.received_date}>
          <input type="date" value={date} max={todayInLagos()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="line-editor">
        <div className="line-editor-head" aria-hidden>
          <span>Product</span>
          <span>Batch</span>
          <span>Expiry</span>
          <span>Quantity</span>
          <span />
        </div>
        {lines.map((l, i) => {
          const p = l.productId ? byId.get(l.productId) : undefined
          const tracked = p?.requires_batch_tracking ?? true
          const known = knownBatch(l)
          const err = (f: string) => errors[`items.${i}.${f}`]
          return (
            <div key={l.key} className="line-editor-row">
              <label className="line-cell">
                <span className="line-label">Product</span>
                <select
                  value={l.productId}
                  aria-invalid={err('product_id') ? true : undefined}
                  onChange={(e) => update(l.key, { productId: e.target.value ? Number(e.target.value) : '', batchNo: '', expiry: '' })}
                >
                  <option value="">Select…</option>
                  {byCategory.map(([category, items]) => (
                    <optgroup key={category} label={category}>
                      {items.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {err('product_id') && <span className="field-error">{err('product_id')}</span>}
              </label>
              <label className="line-cell">
                <span className="line-label">Batch</span>
                {tracked ? (
                  <>
                    <input
                      value={l.batchNo}
                      list={`${listId}-${l.key}`}
                      aria-invalid={err('batch_no') ? true : undefined}
                      onChange={(e) => update(l.key, { batchNo: e.target.value })}
                      style={{ textTransform: 'uppercase' }}
                    />
                    <datalist id={`${listId}-${l.key}`}>
                      {batchesOf(l.productId).map((b) => (
                        <option key={b.batch_id} value={b.batch_no ?? ''} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <input value="Not batch-tracked" readOnly />
                )}
                {err('batch_no') && <span className="field-error">{err('batch_no')}</span>}
              </label>
              <label className="line-cell">
                <span className="line-label">Expiry</span>
                {!tracked ? (
                  <input value="—" readOnly />
                ) : known ? (
                  <input value={formatDate(known.expiry_date)} readOnly title="Known batch: expiry already on record" />
                ) : (
                  <input type="date" value={l.expiry} aria-invalid={err('expiry_date') ? true : undefined} onChange={(e) => update(l.key, { expiry: e.target.value })} />
                )}
                {err('expiry_date') && <span className="field-error">{err('expiry_date')}</span>}
              </label>
              <label className="line-cell">
                <span className="line-label">Quantity</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={l.quantity}
                  aria-invalid={err('quantity') ? true : undefined}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                />
                {err('quantity') && <span className="field-error">{err('quantity')}</span>}
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
        <button type="button" className="btn btn-ghost" disabled={create.isPending} onClick={() => submit(false)}>
          <Save size={16} /> Save draft
        </button>
        <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={() => submit(true)}>
          <Check size={16} /> {create.isPending ? 'Saving…' : 'Confirm receipt'}
        </button>
      </div>
    </form>
  )
}
