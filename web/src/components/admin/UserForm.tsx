import { AlertCircle, Save, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useCreateUser, useLgaFacilities, useLgas, useUpdateUser } from '../../lib/admin-queries'
import { fieldErrors } from '../../lib/api-client'
import { manageableRoles } from '../../lib/auth'
import { ROLE_LABEL } from '../../lib/format'
import { roleInUse } from '../../lib/plan'
import { useStates } from '../../lib/queries'
import type { User, UserRole } from '../../lib/types'
import { Field } from '../form/Field'

interface Props {
  me: User
  /** The account being edited; absent to create one. */
  user?: User
  onCreated: (user: User, temporaryPassword: string) => void
  onSaved: (user: User) => void
  onCancel: () => void
}

const toId = (v: string) => (v ? Number(v) : null)

/**
 * Create or edit an account. The roles offered and the places they can be
 * anchored follow what the API allows the signed-in user (one level down,
 * in their own area); the API re-checks everything.
 */
export function UserForm({ me, user, onCreated, onSaved, onCancel }: Props) {
  const roles = manageableRoles(me)
  // Free plan: one active account per role. A deactivated account can be edited freely; it doesn't hold a place.
  const inUse = (r: UserRole) => (user && !user.is_active ? false : roleInUse(me, r, user))
  const limited = !!me.organization?.limits
  const states = useStates()
  const create = useCreateUser()
  const update = useUpdateUser()

  // Officers are fixed to their own area; admins and federal officers pick.
  const ownState = me.role === 'state_officer' ? me.state_id : null
  const ownLga = me.role === 'lga_officer' ? me.lga_id : null

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<UserRole>(user?.role ?? roles.find((r) => !inUse(r)) ?? roles[0])
  // Edits know only the node's names (node.path), so the pickers start from those.
  const [stateId, setStateId] = useState<number | null>(ownState ?? user?.state_id ?? null)
  const [stateName] = useState(user && user.role !== 'state_officer' ? user.node.path[0] : null)
  const [lgaId, setLgaId] = useState<number | null>(ownLga ?? user?.lga_id ?? null)
  const [lgaName] = useState(user?.role === 'sdp_staff' ? user.node.path[1] : null)
  const [facilityId, setFacilityId] = useState<number | null>(user?.facility_id ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Resolve the edited account's state / LGA by name once the lists arrive.
  const resolvedState = stateId ?? states.data?.find((s) => s.name === stateName)?.id ?? null
  const lgas = useLgas(ownLga ? null : resolvedState)
  const resolvedLga = lgaId ?? lgas.data?.find((l) => l.name === lgaName)?.id ?? null
  const facilities = useLgaFacilities(role === 'sdp_staff' ? resolvedLga : null)

  const needsState = role === 'state_officer' || ((role === 'lga_officer' || role === 'sdp_staff') && !ownState && !ownLga)
  const needsLga = (role === 'lga_officer' || role === 'sdp_staff') && !ownLga
  const pending = create.isPending || update.isPending

  function body() {
    return {
      name: name.trim(),
      email: email.trim(),
      role,
      state_id: role === 'state_officer' ? resolvedState : null,
      lga_id: role === 'lga_officer' ? resolvedLga : null,
      facility_id: role === 'sdp_staff' ? facilityId : null,
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const b = body()
    const found: Record<string, string> = {}
    if (!b.name) found.name = 'Enter their name.'
    if (!/^\S+@\S+\.\S+$/.test(b.email)) found.email = 'Enter a valid email address.'
    if (role === 'state_officer' && !b.state_id) found.state_id = 'Choose the state.'
    if (role === 'lga_officer' && !b.lga_id) found.lga_id = 'Choose the LGA.'
    if (role === 'sdp_staff' && !b.facility_id) found.facility_id = 'Choose the facility.'
    setErrors(found)
    if (Object.keys(found).length) return

    const onError = (err: Error) => setErrors(fieldErrors(err))
    if (user) {
      update.mutate({ id: user.id, body: b }, { onSuccess: onSaved, onError })
    } else {
      create.mutate(b, { onSuccess: (res) => onCreated(res.data, res.temporary_password), onError })
    }
  }

  const general = Object.entries(errors).filter(([k]) => !['name', 'email', 'role', 'state_id', 'lga_id', 'facility_id'].includes(k))

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <div className="field-row">
        <Field label="Full name" error={errors.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Email" hint="They sign in with this" error={errors.email}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Role" error={errors.role}>
          <select
            value={role}
            disabled={roles.length === 1}
            onChange={(e) => {
              setRole(e.target.value as UserRole)
              setFacilityId(null)
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r} disabled={inUse(r)}>
                {ROLE_LABEL[r]}
                {inUse(r) ? ' (in use on the free plan)' : ''}
              </option>
            ))}
          </select>
        </Field>

        {needsState && (
          <Field label="State" error={errors.state_id}>
            <select
              value={resolvedState ?? ''}
              onChange={(e) => {
                setStateId(toId(e.target.value))
                setLgaId(null)
                setFacilityId(null)
              }}
            >
              <option value="">Select…</option>
              {states.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {needsLga && (
          <Field label="LGA" error={errors.lga_id}>
            <select
              value={resolvedLga ?? ''}
              disabled={!resolvedState}
              onChange={(e) => {
                setLgaId(toId(e.target.value))
                setFacilityId(null)
              }}
            >
              <option value="">{resolvedState ? 'Select…' : 'Choose a state first'}</option>
              {lgas.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {role === 'sdp_staff' && (
          <Field label="Facility" error={errors.facility_id}>
            <select value={facilityId ?? ''} disabled={!resolvedLga} onChange={(e) => setFacilityId(toId(e.target.value))}>
              <option value="">{resolvedLga ? 'Select…' : 'Choose an LGA first'}</option>
              {facilities.data?.map((f) => (
                <option key={f.id} value={f.id} disabled={!f.is_active}>
                  {f.name}
                  {f.is_active ? '' : ' (closed)'}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {inUse(role) ? (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> The free plan has one active {ROLE_LABEL[role].toLowerCase()} account, and it’s already in use.
          Deactivate it first, or ask the platform owner to upgrade your organization.
        </p>
      ) : (
        limited &&
        !user && (
          <p className="muted small" style={{ margin: 0 }}>
            Free plan: one active account per role.
          </p>
        )
      )}

      {general.length > 0 && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {general.map(([, v]) => v).join(' ')}
        </p>
      )}

      {!user && (
        <p className="muted small" style={{ margin: 0 }}>
          A temporary password is generated and shown once. They choose their own the first time they sign in.
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending || inUse(role)}>
          {user ? <Save size={16} /> : <UserPlus size={16} />} {pending ? 'Saving…' : user ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </form>
  )
}
