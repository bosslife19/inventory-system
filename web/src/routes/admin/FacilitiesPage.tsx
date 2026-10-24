import { AlertCircle, Building2, Pencil, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field } from '../../components/form/Field'
import { BulkImportButton } from '../../components/import/BulkImport'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { LockedAction } from '../../components/plan/Paid'
import { Modal } from '../../components/ui/Modal'
import { useLgaFacilities, useLgas, useSaveFacility } from '../../lib/admin-queries'
import { fieldErrors } from '../../lib/api-client'
import { facilityInUse } from '../../lib/plan'
import { useStates } from '../../lib/queries'
import type { Facility, FacilityType } from '../../lib/types'
import { useUser } from '../../lib/user-context'

const TYPES: { value: FacilityType; label: string }[] = [
  { value: 'health_center', label: 'Health center' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'other', label: 'Other' },
]
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t

/**
 * Facilities (SDPs) per LGA (admin): add them, correct their details, close
 * them. States and LGAs come from the seeded dataset and the stores are
 * created automatically, so neither is edited here. Nothing is deleted.
 */
export function FacilitiesPage() {
  const states = useStates()
  const [stateId, setStateId] = useState<number | null>(null)
  const [lgaId, setLgaId] = useState<number | null>(null)
  const lgas = useLgas(stateId)
  const facilities = useLgaFacilities(lgaId)
  const [editing, setEditing] = useState<Facility | 'new' | null>(null)
  const lga = lgas.data?.find((l) => l.id === lgaId)
  const atLimit = facilityInUse(useUser()) // free plan: its one open facility exists

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Facilities</h1>
          <p className="muted">Service delivery points in each LGA. Stores are created with their LGA, state or the nation.</p>
        </div>
        <div className="head-actions">
          <BulkImportButton
            kind="facilities"
            noun="facilities"
            title="Import facilities"
            intro="Add many facilities (SDPs) at once, in any states and LGAs. Each row names its state and LGA as they appear here."
            invalidates={[['lga-facilities']]}
          />
          {atLimit ? (
            <LockedAction
              feature="multiple_facilities"
              label="New facility"
              icon={<Plus size={18} />}
              className="btn btn-primary"
              reason="The free plan has one open facility, and yours is already set up. Close it to add a different one."
            />
          ) : (
            <button type="button" className="btn btn-primary" disabled={!lgaId} onClick={() => setEditing('new')} title={lgaId ? undefined : 'Choose an LGA first'}>
              <Plus size={18} /> New facility
            </button>
          )}
        </div>
      </header>

      <section className="card card-flush">
        <div className="card-head">
          <div className="filters">
            <select
              aria-label="State"
              value={stateId ?? ''}
              onChange={(e) => {
                setStateId(e.target.value ? Number(e.target.value) : null)
                setLgaId(null)
              }}
            >
              <option value="">Choose a state…</option>
              {states.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select aria-label="LGA" value={lgaId ?? ''} disabled={!stateId} onChange={(e) => setLgaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{stateId ? 'Choose an LGA…' : 'LGA'}</option>
              {lgas.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!lgaId ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Building2 size={28} aria-hidden />
            Choose a state and LGA to see its facilities.
          </div>
        ) : facilities.isError ? (
          <ErrorState error={facilities.error} />
        ) : facilities.isPending ? (
          <Loading />
        ) : facilities.data.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Building2 size={28} aria-hidden />
            No facilities in {lga?.name ?? 'this LGA'} yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th className="hide-sm">Type</th>
                  <th className="hide-sm">Phone</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {facilities.data.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link to={`/facilities/${f.id}`} className="cell-title">
                        {f.name}
                      </Link>
                      {f.address && <div className="muted small">{f.address}</div>}
                    </td>
                    <td className="hide-sm">{typeLabel(f.type)}</td>
                    <td className="hide-sm">{f.phone ?? '—'}</td>
                    <td>{f.is_active ? <span className="badge badge-ok">Open</span> : <span className="badge badge-neutral">Closed</span>}</td>
                    <td className="num">
                      <button type="button" className="btn btn-icon" aria-label={`Edit ${f.name}`} title="Edit" onClick={() => setEditing(f)}>
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
        title={editing === 'new' ? `New facility in ${lga?.name ?? ''} LGA` : editing ? `Edit ${editing.name}` : ''}
        icon={<Building2 size={20} />}
      >
        {editing !== null && lgaId && (
          <FacilityForm facility={editing === 'new' ? undefined : editing} lgaId={lgaId} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  )
}

function FacilityForm({ facility, lgaId, onDone }: { facility?: Facility; lgaId: number; onDone: () => void }) {
  const save = useSaveFacility()
  // Free plan: a closed facility can't reopen while another is open.
  const atLimit = facilityInUse(useUser())
  const cantReopen = !!facility && !facility.is_active && atLimit
  const [f, setF] = useState({
    name: facility?.name ?? '',
    type: (facility?.type ?? 'health_center') as FacilityType,
    address: facility?.address ?? '',
    phone: facility?.phone ?? '',
    latitude: facility?.latitude ?? '',
    longitude: facility?.longitude ?? '',
    is_active: facility?.is_active ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const coord = (v: string) => (v.trim() === '' ? null : Number(v))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!f.name.trim()) found.name = 'Required.'
    const lat = coord(String(f.latitude))
    const lng = coord(String(f.longitude))
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) found.latitude = 'Between -90 and 90.'
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) found.longitude = 'Between -180 and 180.'
    setErrors(found)
    if (Object.keys(found).length) return

    save.mutate(
      {
        id: facility?.id,
        body: {
          ...(facility ? {} : { lga_id: lgaId }),
          name: f.name.trim(),
          type: f.type,
          address: f.address.trim() || null,
          phone: f.phone.trim() || null,
          latitude: lat,
          longitude: lng,
          is_active: f.is_active,
        },
      },
      { onSuccess: onDone, onError: (err) => setErrors(fieldErrors(err)) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <div className="field-row">
        <Field label="Name" error={errors.name}>
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Kawo Primary Health Centre" />
        </Field>
        <Field label="Type" error={errors.type}>
          <select value={f.type} onChange={(e) => set({ type: e.target.value as FacilityType })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Address (optional)" error={errors.address}>
          <input value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Phone (optional)" error={errors.phone}>
          <input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Latitude (optional)" error={errors.latitude}>
          <input inputMode="decimal" value={f.latitude} onChange={(e) => set({ latitude: e.target.value })} placeholder="e.g. 10.5264" />
        </Field>
        <Field label="Longitude (optional)" error={errors.longitude}>
          <input inputMode="decimal" value={f.longitude} onChange={(e) => set({ longitude: e.target.value })} placeholder="e.g. 7.4386" />
        </Field>
      </div>

      {facility && (
        <label className="check">
          <input type="checkbox" checked={f.is_active} disabled={cantReopen} onChange={(e) => set({ is_active: e.target.checked })} />
          <span>
            Open
            <small>
              {cantReopen
                ? 'The free plan has one open facility, and another is open. Close it first to reopen this one.'
                : 'Untick to close it: no new Stock Card entries; its history and accounts stay.'}
            </small>
          </span>
        </label>
      )}

      {(errors.form || errors.lga_id) && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form ?? errors.lga_id}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          <Save size={16} /> {save.isPending ? 'Saving…' : facility ? 'Save changes' : 'Add facility'}
        </button>
      </div>
    </form>
  )
}
