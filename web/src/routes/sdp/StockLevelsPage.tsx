import { AlertCircle, ArrowLeft, Gauge, Lock, Pencil, RotateCcw, Save, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { Modal } from '../../components/ui/Modal'
import { useProductLevels, useSaveProductLevels } from '../../lib/admin-queries'
import { fieldErrors } from '../../lib/api-client'
import { canRecordAt } from '../../lib/auth'
import { UNITS, formatDate, formatQty, unitDescription } from '../../lib/format'
import { useFacility } from '../../lib/queries'
import type { ProductLevel, User } from '../../lib/types'

/**
 * One facility's (or store's) min / EOP / max per product. The right levels
 * differ between an SDP, an LGA store, a state store and the national store,
 * so whoever keeps the Stock Card sets them; until they do, the catalog's
 * defaults apply. Alerts and push notifications go out when usable stock
 * reaches the EOP in force here.
 */
export function StockLevelsPage({ facilityId, user }: { facilityId: number; user: User }) {
  const facility = useFacility(facilityId)
  const levels = useProductLevels(facilityId)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ProductLevel | null>(null)

  if (facility.isError) return <ErrorState error={facility.error} />
  if (levels.isError) return <ErrorState error={levels.error} />
  if (facility.isPending || levels.isPending) return <Loading />

  const f = facility.data
  const canEdit = canRecordAt(user, facilityId)
  const q = query.trim().toLowerCase()
  const rows = levels.data.filter(
    (r) => !q || r.product.name.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q) || r.product.category.toLowerCase().includes(q),
  )
  const ownCount = levels.data.filter((r) => r.source === 'facility').length

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <Link to={`/facilities/${facilityId}`} className="back-link">
            <ArrowLeft size={15} /> {f.name}
          </Link>
          <p className="eyebrow">Stock levels</p>
          <h1>Min / EOP / max at {f.name}</h1>
          <p className="muted">
            The EOP (emergency order point) is lower than the minimum. When usable stock reaches it, alerts and push
            notifications go out. Below the minimum, it's time to order.
          </p>
        </div>
        <div className="head-actions">
          {!canEdit && (
            <span className="badge badge-neutral badge-plain">
              <Lock size={12} /> Read-only
            </span>
          )}
        </div>
      </header>

      <section className="card card-flush">
        <div className="card-head">
          <p className="muted small" style={{ margin: 0 }}>
            {ownCount === 0 ? 'Using the catalog defaults for every product.' : `Own levels set for ${ownCount} of ${levels.data.length} products.`}
          </p>
          <label className="search">
            <Search size={16} />
            <input type="search" placeholder="Search name, code or category…" aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Gauge size={28} aria-hidden />
            {q ? 'No products match that search.' : 'No products in the catalog yet.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="hide-sm">Unit</th>
                  <th className="num">EOP</th>
                  <th className="num">Min</th>
                  <th className="num">Max</th>
                  <th>Source</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product.id}>
                    <td>
                      <div className="cell-title">{r.product.name}</div>
                      <div className="muted small mono">{r.product.sku}</div>
                    </td>
                    <td className="hide-sm">{unitDescription(r.product)}</td>
                    <td className="num">
                      <strong>{formatQty(r.reorder_level)}</strong>
                    </td>
                    <td className="num">{formatQty(r.min_stock_level)}</td>
                    <td className="num">{formatQty(r.max_stock_level)}</td>
                    <td>
                      {r.source === 'facility' ? (
                        <span className="badge badge-ok" title={r.updated_by_name ? `By ${r.updated_by_name}, ${formatDate(r.updated_at?.slice(0, 10))}` : undefined}>
                          Set here
                        </span>
                      ) : (
                        <span className="badge badge-neutral badge-plain">Catalog default</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="num">
                        <button type="button" className="btn btn-icon" aria-label={`Set levels for ${r.product.name}`} title="Set levels" onClick={() => setEditing(r)}>
                          <Pencil size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? editing.product.name : ''} description={`Levels at ${f.name}`} icon={<Gauge size={20} />}>
        {editing && <LevelsForm facilityId={facilityId} row={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function LevelsForm({ facilityId, row, onDone }: { facilityId: number; row: ProductLevel; onDone: () => void }) {
  const save = useSaveProductLevels(facilityId)
  const [f, setF] = useState({
    reorder_level: String(row.reorder_level),
    min_stock_level: String(row.min_stock_level),
    max_stock_level: String(row.max_stock_level),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const plural = UNITS.find((u) => u.value === row.product.unit_of_measure)?.plural ?? row.product.unit_of_measure

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    const level = (k: keyof typeof f) => {
      const n = Number(f[k])
      if (f[k] === '' || !Number.isInteger(n) || n < 0) found[k] = 'Whole number, 0 or more.'
      return n
    }
    const [eop, min, max] = [level('reorder_level'), level('min_stock_level'), level('max_stock_level')]
    if (!found.reorder_level && !found.min_stock_level && eop >= min && !(eop === 0 && min === 0))
      found.reorder_level = 'Must be lower than the minimum level.'
    if (!found.max_stock_level && !found.min_stock_level && max < min) found.max_stock_level = 'Can’t be below the minimum level.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate(
      { productId: row.product.id, levels: { reorder_level: eop, min_stock_level: min, max_stock_level: max } },
      { onSuccess: onDone, onError: (err) => setErrors(fieldErrors(err)) },
    )
  }

  function reset() {
    save.mutate({ productId: row.product.id, levels: null }, { onSuccess: onDone, onError: (err) => setErrors(fieldErrors(err)) })
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <p className="muted small" style={{ margin: 0 }}>
        Counted in {plural}
        {row.product.pack_size ? ` (${formatQty(row.product.pack_size)} pieces each)` : ''}. Catalog defaults: EOP {formatQty(row.product.reorder_level)}, min{' '}
        {formatQty(row.product.min_stock_level)}, max {formatQty(row.product.max_stock_level)}.
      </p>
      <div className="field-row">
        <Field label="EOP" hint="Alerts at or below this" error={errors.reorder_level}>
          <input type="number" min={0} step={1} value={f.reorder_level} onChange={(e) => set({ reorder_level: e.target.value })} autoFocus />
        </Field>
        <Field label="Minimum level" hint="Higher than the EOP" error={errors.min_stock_level}>
          <input type="number" min={0} step={1} value={f.min_stock_level} onChange={(e) => set({ min_stock_level: e.target.value })} />
        </Field>
        <Field label="Maximum level" error={errors.max_stock_level}>
          <input type="number" min={0} step={1} value={f.max_stock_level} onChange={(e) => set({ max_stock_level: e.target.value })} />
        </Field>
      </div>

      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'space-between' }}>
        {row.source === 'facility' ? (
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={save.isPending} title="Drop the levels set here">
            <RotateCcw size={16} /> Use catalog defaults
          </button>
        ) : (
          <span />
        )}
        <span className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            <Save size={16} /> {save.isPending ? 'Saving…' : 'Save levels'}
          </button>
        </span>
      </div>
    </form>
  )
}
