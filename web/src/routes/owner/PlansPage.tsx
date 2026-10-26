import { AlertCircle, CreditCard, Pencil, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { Field } from '../../components/form/Field'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { Modal } from '../../components/ui/Modal'
import { fieldErrors } from '../../lib/api-client'
import { formatNaira, formatQty } from '../../lib/format'
import { usePlanTiers, useSavePlanTier } from '../../lib/owner-queries'
import type { PlanTier } from '../../lib/types'

const limit = (n: number | null, noun: string) => (n === null ? `Unlimited ${noun}` : `${formatQty(n)} ${noun}`)

/**
 * The paid plan tiers organizations buy on their Billing page (Paystack):
 * a monthly price and caps on open facilities and active accounts. Every
 * tier unlocks every paid feature. Tiers are withdrawn, never deleted.
 */
export function PlansPage() {
  const tiers = usePlanTiers()
  const [editing, setEditing] = useState<PlanTier | 'new' | null>(null)

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Plans & prices</h1>
          <p className="muted">
            What organizations pay through Paystack. Every plan unlocks every paid feature; plans differ by limits.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> New plan
          </button>
        </div>
      </header>

      <section className="card card-flush">
        {tiers.isError ? (
          <ErrorState error={tiers.error} />
        ) : tiers.isPending ? (
          <Loading />
        ) : tiers.data.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <CreditCard size={28} aria-hidden />
            No plans yet. Add one so organizations can pay online.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Per month</th>
                  <th>Facilities</th>
                  <th>Accounts</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tiers.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="cell-title">{t.name}</div>
                      {t.description && <div className="muted small">{t.description}</div>}
                    </td>
                    <td className="num nowrap">{formatNaira(t.monthly_price)}</td>
                    <td className="nowrap">{limit(t.max_facilities, 'open')}</td>
                    <td className="nowrap">{limit(t.max_accounts, 'active')}</td>
                    <td>
                      {t.is_active ? (
                        <span className="badge badge-ok">On offer</span>
                      ) : (
                        <span className="badge badge-neutral">Withdrawn</span>
                      )}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`Edit ${t.name}`}
                        title="Edit"
                        onClick={() => setEditing(t)}
                      >
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

      <p className="muted small" style={{ margin: 0 }}>
        A new price applies to payments from now on; what organizations already paid for doesn’t change. A withdrawn
        plan stays with the organizations on it until it ends. Lowering a limit never removes facilities or accounts —
        they just can’t add more.
      </p>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New plan' : editing ? `Edit ${editing.name}` : ''}
        icon={<CreditCard size={20} />}
      >
        {editing !== null && (
          <PlanTierForm tier={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  )
}

function PlanTierForm({ tier, onDone }: { tier?: PlanTier; onDone: () => void }) {
  const save = useSavePlanTier(tier?.id)
  const [name, setName] = useState(tier?.name ?? '')
  const [description, setDescription] = useState(tier?.description ?? '')
  const [price, setPrice] = useState(tier ? String(tier.monthly_price) : '')
  const [facilities, setFacilities] = useState(tier?.max_facilities != null ? String(tier.max_facilities) : '')
  const [accounts, setAccounts] = useState(tier?.max_accounts != null ? String(tier.max_accounts) : '')
  const [order, setOrder] = useState(String(tier?.sort_order ?? 0))
  const [active, setActive] = useState(tier?.is_active ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN)
  const optional = (v: string) => (v.trim() === '' ? null : whole(v))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      monthly_price: whole(price),
      max_facilities: optional(facilities),
      max_accounts: optional(accounts),
      sort_order: whole(order) || 0,
      is_active: active,
    }
    const found: Record<string, string> = {}
    if (!body.name) found.name = 'Name the plan.'
    if (!(body.monthly_price >= 100)) found.monthly_price = 'Enter the monthly price in naira (at least ₦100).'
    if (body.max_facilities !== null && !(body.max_facilities >= 1))
      found.max_facilities = 'A whole number, or empty for no limit.'
    if (body.max_accounts !== null && !(body.max_accounts >= 1))
      found.max_accounts = 'A whole number, or empty for no limit.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate(body, { onSuccess: onDone, onError: (err) => setErrors(fieldErrors(err)) })
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <div className="field-row">
        <Field label="Plan name" error={errors.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Price per month (₦)" error={errors.monthly_price}>
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Field label="Short description" hint="Shown to admins on their Billing page" error={errors.description}>
        <input value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
      </Field>
      <div className="field-row">
        <Field label="Open facilities" hint="Empty = no limit" error={errors.max_facilities}>
          <input
            inputMode="numeric"
            value={facilities}
            onChange={(e) => setFacilities(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Active accounts" hint="Every role together. Empty = no limit" error={errors.max_accounts}>
          <input
            inputMode="numeric"
            value={accounts}
            onChange={(e) => setAccounts(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Order" hint="Lower comes first" error={errors.sort_order}>
          <input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} autoComplete="off" />
        </Field>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>
            On offer
            <small>Untick to stop selling it</small>
          </span>
        </label>
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
          <Save size={18} /> {tier ? 'Save changes' : 'Add plan'}
        </button>
      </div>
    </form>
  )
}
