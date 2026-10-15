import { AlertCircle, Package, Pencil, Plus, Save, Search, Snowflake } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field } from '../../components/form/Field'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { Modal } from '../../components/ui/Modal'
import { useCatalog, useSaveProduct } from '../../lib/admin-queries'
import { fieldErrors } from '../../lib/api-client'
import { formatQty } from '../../lib/format'
import type { Product } from '../../lib/types'

const STATUS: { value: boolean | undefined; label: string }[] = [
  { value: true, label: 'Active' },
  { value: false, label: 'Retired' },
  { value: undefined, label: 'All' },
]

/**
 * The product catalog (admin): add products, change their thresholds, and
 * retire ones no longer supplied. Products are never deleted — the Stock
 * Card history refers to them.
 */
export function ProductsPage() {
  const catalog = useCatalog()
  const [status, setStatus] = useState<boolean | undefined>(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)

  const all = catalog.data ?? []
  const categories = useMemo(() => [...new Set((catalog.data ?? []).map((p) => p.category))].sort(), [catalog.data])
  const q = query.trim().toLowerCase()
  const rows = all.filter(
    (p) =>
      (status === undefined || p.is_active === status) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
  )

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Products</h1>
          <p className="muted">The catalog every facility records against, with its stock thresholds</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> New product
          </button>
        </div>
      </header>

      <section className="card card-flush">
        <div className="card-head">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS.map((s) => (
              <button key={s.label} type="button" aria-pressed={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={16} />
            <input type="search" placeholder="Search name, code or category…" aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {catalog.isError ? (
          <ErrorState error={catalog.error} />
        ) : catalog.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Package size={28} aria-hidden />
            {q ? 'No products match that search.' : 'No products here.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hide-sm">Category</th>
                  <th className="hide-sm">Unit</th>
                  <th className="num">Min / EOP / Max</th>
                  <th className="hide-sm">Tracking</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-title">{p.name}</div>
                      <div className="muted small mono">{p.sku}</div>
                    </td>
                    <td className="hide-sm">{p.category}</td>
                    <td className="hide-sm">{p.unit_of_measure}</td>
                    <td className="num nowrap">
                      {formatQty(p.min_stock_level)} / {formatQty(p.reorder_level)} / {formatQty(p.max_stock_level)}
                    </td>
                    <td className="hide-sm nowrap">
                      {p.requires_batch_tracking ? <span className="badge badge-neutral badge-plain">Batches</span> : <span className="muted small">—</span>}{' '}
                      {p.requires_cold_chain && (
                        <span className="badge badge-notice badge-plain">
                          <Snowflake size={12} /> Cold chain
                        </span>
                      )}
                    </td>
                    <td>{p.is_active ? <span className="badge badge-ok">Active</span> : <span className="badge badge-neutral">Retired</span>}</td>
                    <td className="num">
                      <button type="button" className="btn btn-icon" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => setEditing(p)}>
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'New product' : editing ? `Edit ${editing.name}` : ''}
        icon={<Package size={20} />}
      >
        {editing !== null && (
          <ProductForm product={editing === 'new' ? undefined : editing} categories={categories} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  )
}

function ProductForm({ product, categories, onDone }: { product?: Product; categories: string[]; onDone: () => void }) {
  const save = useSaveProduct()
  const [f, setF] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    category: product?.category ?? '',
    unit_of_measure: product?.unit_of_measure ?? '',
    requires_batch_tracking: product?.requires_batch_tracking ?? true,
    requires_cold_chain: product?.requires_cold_chain ?? false,
    min_stock_level: String(product?.min_stock_level ?? ''),
    reorder_level: String(product?.reorder_level ?? ''),
    max_stock_level: String(product?.max_stock_level ?? ''),
    is_active: product?.is_active ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    for (const k of ['name', 'sku', 'category', 'unit_of_measure'] as const) if (!f[k].trim()) found[k] = 'Required.'
    const level = (k: 'min_stock_level' | 'reorder_level' | 'max_stock_level') => {
      const n = Number(f[k])
      if (f[k] === '' || !Number.isInteger(n) || n < 0) found[k] = 'Whole number, 0 or more.'
      return n
    }
    const [min, eop, max] = [level('min_stock_level'), level('reorder_level'), level('max_stock_level')]
    if (!found.reorder_level && !found.min_stock_level && eop < min) found.reorder_level = 'Can’t be below the minimum.'
    if (!found.max_stock_level && !found.reorder_level && max < eop) found.max_stock_level = 'Can’t be below the reorder level.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate(
      {
        id: product?.id,
        body: {
          ...f,
          name: f.name.trim(),
          sku: f.sku.trim(),
          category: f.category.trim(),
          unit_of_measure: f.unit_of_measure.trim(),
          min_stock_level: min,
          reorder_level: eop,
          max_stock_level: max,
        },
      },
      { onSuccess: onDone, onError: (err) => setErrors(fieldErrors(err)) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <div className="field-row">
        <Field label="Name" error={errors.name}>
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Amoxicillin 250mg dispersible tablets (10)" />
        </Field>
        <Field label="Product code (SKU)" hint="Printed on delivery notes" error={errors.sku}>
          <input value={f.sku} onChange={(e) => set({ sku: e.target.value })} style={{ textTransform: 'uppercase' }} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Category" error={errors.category}>
          <input value={f.category} list="product-categories" onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <datalist id="product-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="Unit of measure" hint="e.g. pack, sachet, ampoule" error={errors.unit_of_measure}>
          <input value={f.unit_of_measure} onChange={(e) => set({ unit_of_measure: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Minimum level" error={errors.min_stock_level}>
          <input type="number" min={0} step={1} value={f.min_stock_level} onChange={(e) => set({ min_stock_level: e.target.value })} />
        </Field>
        <Field label="Reorder level (EOP)" error={errors.reorder_level}>
          <input type="number" min={0} step={1} value={f.reorder_level} onChange={(e) => set({ reorder_level: e.target.value })} />
        </Field>
        <Field label="Maximum level" error={errors.max_stock_level}>
          <input type="number" min={0} step={1} value={f.max_stock_level} onChange={(e) => set({ max_stock_level: e.target.value })} />
        </Field>
      </div>

      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={f.requires_batch_tracking} onChange={(e) => set({ requires_batch_tracking: e.target.checked })} />
          <span>
            Track batches and expiry
            <small>Every entry needs a batch number. Can’t be changed once the product is on any Stock Card.</small>
          </span>
        </label>
        {errors.requires_batch_tracking && <span className="field-error">{errors.requires_batch_tracking}</span>}
        <label className="check">
          <input type="checkbox" checked={f.requires_cold_chain} onChange={(e) => set({ requires_cold_chain: e.target.checked })} />
          <span>
            Needs cold chain
            <small>Stored refrigerated (e.g. oxytocin, vaccines).</small>
          </span>
        </label>
        {product && (
          <label className="check">
            <input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            <span>
              Active
              <small>Untick to retire it: it disappears from entry forms, and its history stays.</small>
            </span>
          </label>
        )}
      </div>

      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          <Save size={16} /> {save.isPending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </button>
      </div>
    </form>
  )
}
