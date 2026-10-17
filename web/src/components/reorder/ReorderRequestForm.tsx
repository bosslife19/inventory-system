import { AlertCircle, Plus, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatQty, unitPlural } from '../../lib/format'
import { useCreateReorderRequest, useProducts, useReorderSuggestions, useReorderSuppliers } from '../../lib/queries'
import type { ReorderRequest } from '../../lib/types'
import { Field } from '../form/Field'
import { Loading } from '../layout/PageState'

interface Line {
  key: number
  productId: number | ''
  quantity: string
}

let nextKey = 1

/**
 * Ask a store above for stock. Starts from the reorder suggestions — what
 * this facility needs to get back up to its max — and can be changed freely.
 */
export function ReorderRequestForm({ facilityId, onDone, onCancel }: { facilityId: number; onDone: (r: ReorderRequest) => void; onCancel: () => void }) {
  const suppliers = useReorderSuppliers(facilityId)
  const products = useProducts()
  const suggestions = useReorderSuggestions(facilityId)
  const create = useCreateReorderRequest(facilityId)
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [comments, setComments] = useState('')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  if (suppliers.isPending || products.isPending || suggestions.isPending) return <Loading />

  // First render with data: prefill from what the reorder arithmetic says to order.
  const current =
    lines ??
    (() => {
      const suggested = (suggestions.data ?? [])
        .filter((s) => s.suggested_quantity > 0)
        .map((s) => ({ key: nextKey++, productId: s.product.id, quantity: String(s.suggested_quantity) }))
      return suggested.length ? suggested : [{ key: nextKey++, productId: '' as const, quantity: '' }]
    })()
  const setCurrent = (fn: (ls: Line[]) => Line[]) => setLines(fn(current))
  const update = (key: number, patch: Partial<Line>) => setCurrent((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const supplier = supplierId || suppliers.data?.[0]?.id || ''
  const catalog = products.data ?? []
  const productOf = (id: number | '') => catalog.find((p) => p.id === id)
  const suggestionOf = (id: number | '') => suggestions.data?.find((s) => s.product.id === id)

  function submit() {
    const e: Record<string, string> = {}
    if (!supplier) e.supplier_facility_id = 'Choose the store to ask.'
    const seen = new Set<number>()
    current.forEach((l, i) => {
      if (!l.productId) e[`items.${i}.product_id`] = 'Choose a product.'
      else if (seen.has(l.productId)) e[`items.${i}.product_id`] = 'Already on the list.'
      else seen.add(l.productId)
      const q = Number(l.quantity)
      if (!l.quantity || !Number.isInteger(q) || q < 1) e[`items.${i}.quantity`] = 'Whole number above 0.'
    })
    setErrors(e)
    if (Object.keys(e).length) return

    create.mutate(
      {
        supplier_facility_id: supplier as number,
        comments: comments.trim() || null,
        items: current.map((l) => ({ product_id: l.productId as number, quantity: Number(l.quantity) })),
      },
      {
        onSuccess: onDone,
        onError: (err) =>
          setErrors(
            err instanceof ApiError && err.status === 422
              ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]]))
              : { form: err.message },
          ),
      },
    )
  }

  const general = Object.entries(errors).filter(([k]) => !/^items\.\d+\./.test(k) && k !== 'supplier_facility_id')

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      <Field label="Ask" hint="The store that should send it — usually the one directly above" error={errors.supplier_facility_id ?? (suppliers.isError ? suppliers.error.message : undefined)}>
        <select value={supplier} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
          {suppliers.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="line-editor request-lines">
        <div className="line-editor-head" aria-hidden>
          <span>Product</span>
          <span>Quantity</span>
          <span />
        </div>
        {current.map((l, i) => {
          const p = productOf(l.productId)
          const sug = suggestionOf(l.productId)
          const err = (f: string) => errors[`items.${i}.${f}`]
          return (
            <div key={l.key} className="line-editor-row">
              <label className="line-cell">
                <span className="line-label">Product</span>
                <select value={l.productId} aria-invalid={err('product_id') ? true : undefined} onChange={(e) => update(l.key, { productId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">Select…</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {err('product_id') ? (
                  <span className="field-error">{err('product_id')}</span>
                ) : (
                  sug && (
                    <span className="muted small">
                      {formatQty(sug.usable_quantity)} usable here · suggested {formatQty(sug.suggested_quantity)}
                    </span>
                  )
                )}
              </label>
              <label className="line-cell">
                <span className="line-label">Quantity</span>
                <input type="number" inputMode="numeric" min={1} step={1} value={l.quantity} aria-invalid={err('quantity') ? true : undefined} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                {err('quantity') ? <span className="field-error">{err('quantity')}</span> : p && <span className="muted small">{unitPlural(p.unit_of_measure)}{p.pack_size ? ` of ${formatQty(p.pack_size)}` : ''}</span>}
              </label>
              <button type="button" className="btn btn-icon" aria-label={`Remove line ${i + 1}`} disabled={current.length === 1} onClick={() => setCurrent((ls) => ls.filter((x) => x.key !== l.key))}>
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrent((ls) => [...ls, { key: nextKey++, productId: '', quantity: '' }])}>
          <Plus size={15} /> Add product
        </button>
      </div>

      <Field label="Comments (optional)">
        <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Malaria season — demand is up" />
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
        <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={submit}>
          <Send size={16} /> {create.isPending ? 'Sending…' : 'Send request'}
        </button>
      </div>
      <p className="muted small" style={{ margin: '0.5rem 0 0', textAlign: 'right' }}>
        The store’s officers are notified straight away, and you’ll hear when they send it.
      </p>
    </form>
  )
}
