import { ArrowLeft, Ban, Building, KeyRound, Mail, MapPin, Pencil, Phone, PlayCircle, Receipt, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TemporaryPassword } from '../../components/admin/TemporaryPassword'
import { PaymentTable } from '../../components/billing/PaymentTable'
import { Field } from '../../components/form/Field'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { LogoUpload } from '../../components/owner/LogoUpload'
import { OrganizationForm } from '../../components/owner/OrganizationForm'
import { PlanBadge } from '../../components/owner/PlanBadge'
import { Modal } from '../../components/ui/Modal'
import { fieldErrors } from '../../lib/api-client'
import { formatDate } from '../../lib/format'
import { FEATURE_LABEL } from '../../lib/plan'
import {
  useAddOrganizationAdmin,
  useOrganization,
  useOrganizationAdmins,
  useOrganizationPayments,
  useResetAdminPassword,
  useSetAdminActive,
  useUpdateOrganization,
} from '../../lib/owner-queries'
import type { Feature, User } from '../../lib/types'

/**
 * One organization, as the owner manages it: details and plan, its logo,
 * suspending it, and the admin accounts the owner hands sign-in details to.
 */
export function OrganizationPage({ id }: { id: number }) {
  const org = useOrganization(id)
  const admins = useOrganizationAdmins(id)
  const payments = useOrganizationPayments(id)
  const update = useUpdateOrganization(id)
  const setActive = useSetAdminActive(id)
  const reset = useResetAdminPassword(id)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [password, setPassword] = useState<{ user: User; password: string } | null>(null)

  if (org.isError) return <ErrorState error={org.error} />
  if (org.isPending) return <Loading />
  const o = org.data

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <Link to="/owner" className="back-link">
            <ArrowLeft size={15} /> Organizations
          </Link>
          <p className="eyebrow">Organization</p>
          <h1>{o.name}</h1>
          <div className="meta-row" style={{ marginTop: '0.35rem' }}>
            <PlanBadge organization={o} />
            {o.contact_email && (
              <span>
                <Mail size={15} /> {o.contact_email}
              </span>
            )}
            {o.contact_phone && (
              <span>
                <Phone size={15} /> {o.contact_phone}
              </span>
            )}
            {o.address && (
              <span>
                <MapPin size={15} /> {o.address}
              </span>
            )}
          </div>
        </div>
        <div className="head-actions">
          {o.is_active ? (
            <button type="button" className="btn btn-ghost" onClick={() => setSuspending(true)}>
              <Ban size={18} /> Suspend
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={update.isPending} onClick={() => update.mutate({ is_active: true })}>
              <PlayCircle size={18} /> Reactivate
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
            <Pencil size={18} /> Edit details & plan
          </button>
        </div>
      </header>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Plan</h2>
              <p>
                {o.effective_plan === 'paid' && o.plan_tier ? `${o.plan_tier.name} · ` : ''}
                {o.effective_plan === 'paid'
                  ? o.paid_until
                    ? `Paid to ${formatDate(o.paid_until)} — ${o.days_left} day${o.days_left === 1 ? '' : 's'} left`
                    : 'Paid, no end date'
                  : o.plan === 'paid' && o.paid_until
                    ? `Paid plan ended ${formatDate(o.paid_until)}; on the free plan until renewed`
                    : 'Free plan'}
              </p>
            </div>
          </div>
          <ul className="feature-list">
            {(Object.keys(FEATURE_LABEL) as Feature[]).map((f) => (
              <li key={f} className={o.features.includes(f) ? 'is-on' : ''}>
                {FEATURE_LABEL[f]}
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ margin: '0.75rem 0 0' }}>
            {o.facility_count} facilities
            {o.plan_tier?.max_facilities != null ? ` (of ${o.plan_tier.max_facilities})` : ''} · {o.user_count} accounts
            {o.plan_tier?.max_accounts != null ? ` (${o.plan_tier.max_accounts} may be active)` : ''}. They pay online on their Billing page;
            to record a payment made another way, edit the plan and move “Paid until” on.
          </p>
          {o.notes && <p className="owner-notes">{o.notes}</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Logo</h2>
              <p>Shown beside your own logo in their dashboard and app</p>
            </div>
          </div>
          <LogoUpload target={o.id} logoUrl={o.logo_url} name={o.name} />
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Admins</h2>
            <p>Send each admin their email and temporary password. They create everyone else in the organization.</p>
          </div>
          <div className="head-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
              <UserPlus size={17} /> Add admin
            </button>
          </div>
        </div>
        {admins.isError ? (
          <ErrorState error={admins.error} />
        ) : admins.isPending ? (
          <Loading />
        ) : admins.data.length === 0 ? (
          <div className="page-state" style={{ padding: '2.5rem 1rem' }}>
            <Users size={28} aria-hidden />
            No admins yet — add one so they can sign in.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-title">{u.name}</div>
                      <div className="muted small">{u.email}</div>
                    </td>
                    <td>
                      {!u.is_active ? (
                        <span className="badge badge-neutral">Deactivated</span>
                      ) : u.must_change_password ? (
                        <span className="badge badge-warning" title="Hasn’t signed in and set their own password yet">
                          Temporary password
                        </span>
                      ) : (
                        <span className="badge badge-ok">Active</span>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={reset.isPending}
                        onClick={() => reset.mutate(u.id, { onSuccess: (res) => setPassword({ user: res.data, password: res.temporary_password }) })}
                      >
                        <KeyRound size={14} /> Reset password
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ userId: u.id, is_active: !u.is_active })}
                      >
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Payments</h2>
            <p>Paid online through Paystack, newest first</p>
          </div>
        </div>
        {payments.isError ? (
          <ErrorState error={payments.error} />
        ) : payments.isPending ? (
          <Loading />
        ) : payments.data.length === 0 ? (
          <div className="page-state" style={{ padding: '2.5rem 1rem' }}>
            <Receipt size={28} aria-hidden />
            No online payments yet.
          </div>
        ) : (
          <PaymentTable payments={payments.data} />
        )}
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} size="lg" title={`Edit ${o.name}`} icon={<Building size={20} />}>
        {editing && <OrganizationForm organization={o} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add an admin" description={o.name} icon={<UserPlus size={20} />}>
        {adding && (
          <AddAdminForm
            organizationId={o.id}
            onCancel={() => setAdding(false)}
            onCreated={(user, pw) => {
              setAdding(false)
              setPassword({ user, password: pw })
            }}
          />
        )}
      </Modal>

      <Modal open={password !== null} onClose={() => setPassword(null)} title="Sign-in details" description={o.name} icon={<KeyRound size={20} />}>
        {password && <TemporaryPassword user={password.user} password={password.password} onClose={() => setPassword(null)} />}
      </Modal>

      <Modal open={suspending} onClose={() => setSuspending(false)} title={`Suspend ${o.name}?`} icon={<Ban size={20} />}>
        <p style={{ marginTop: 0 }}>
          Everyone in {o.name} is signed out at once and can’t sign in until you reactivate it. Nothing is deleted — their Stock Cards
          and history are kept.
        </p>
        <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setSuspending(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={update.isPending}
            onClick={() => update.mutate({ is_active: false }, { onSuccess: () => setSuspending(false) })}
          >
            <Ban size={18} /> Suspend
          </button>
        </div>
      </Modal>
    </div>
  )
}

function AddAdminForm({ organizationId, onCreated, onCancel }: { organizationId: number; onCreated: (user: User, password: string) => void; onCancel: () => void }) {
  const add = useAddOrganizationAdmin(organizationId)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter their name.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'Enter a valid email address.'
    setErrors(found)
    if (Object.keys(found).length) return
    add.mutate(
      { name: name.trim(), email: email.trim() },
      { onSuccess: (res) => onCreated(res.data, res.temporary_password), onError: (err) => setErrors(fieldErrors(err)) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <Field label="Name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Email" hint="They sign in with this" error={errors.email}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </Field>
      {errors.form && <p className="form-error">{errors.form}</p>}
      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={add.isPending}>
          <UserPlus size={18} /> Create admin
        </button>
      </div>
    </form>
  )
}
