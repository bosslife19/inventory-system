import { AlertCircle, Save } from 'lucide-react'
import { useState } from 'react'
import { fieldErrors } from '../../lib/api-client'
import { useCreateOrganization, useUpdateOrganization } from '../../lib/owner-queries'
import type { Organization, Plan, User } from '../../lib/types'
import { Field } from '../form/Field'

interface Props {
  /** The organization being edited; absent to set up a new one. */
  organization?: Organization
  onCreated?: (organization: Organization, admin: User | null, temporaryPassword: string | null) => void
  onSaved?: (organization: Organization) => void
  onCancel: () => void
}

/**
 * An organization's details and plan. Setting one up can also make its first
 * admin, whose temporary password comes back once. Payment is arranged
 * outside the system; recording it is setting the plan and its last day.
 */
export function OrganizationForm({ organization: o, onCreated, onSaved, onCancel }: Props) {
  const create = useCreateOrganization()
  const update = useUpdateOrganization(o?.id ?? 0)
  const [name, setName] = useState(o?.name ?? '')
  const [contactName, setContactName] = useState(o?.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(o?.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(o?.contact_phone ?? '')
  const [address, setAddress] = useState(o?.address ?? '')
  const [plan, setPlan] = useState<Plan>(o?.plan ?? 'paid')
  const [paidUntil, setPaidUntil] = useState(o?.paid_until ?? '')
  const [notes, setNotes] = useState(o?.notes ?? '')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Enter the organization’s name.'
    if (!o && (adminName.trim() || adminEmail.trim())) {
      if (!adminName.trim()) found['admin.name'] = 'Enter the admin’s name.'
      if (!/^\S+@\S+\.\S+$/.test(adminEmail.trim())) found['admin.email'] = 'Enter a valid email address.'
    }
    setErrors(found)
    if (Object.keys(found).length) return

    const body = {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      address: address.trim() || null,
      plan,
      paid_until: plan === 'paid' && paidUntil ? paidUntil : null,
      notes: notes.trim() || null,
    }
    const onError = (err: Error) => setErrors(fieldErrors(err))

    if (o) {
      update.mutate(body, { onSuccess: (saved) => onSaved?.(saved), onError })
    } else {
      const admin = adminEmail.trim() ? { name: adminName.trim(), email: adminEmail.trim() } : undefined
      create.mutate(
        { ...body, admin },
        { onSuccess: (res) => onCreated?.(res.data, (res.admin as User | null) ?? null, res.temporary_password ?? null), onError },
      )
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: '0.9rem' }}>
      <Field label="Organization name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <div className="field-row">
        <Field label="Contact person" error={errors.contact_name}>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Contact email" error={errors.contact_email}>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Contact phone" error={errors.contact_phone}>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Address" error={errors.address}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Plan" error={errors.plan} hint="Free: Stock Cards, alerts, reports, accounts. Paid adds dashboards, dispatches, reorder requests, scanning, push and imports.">
          <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
            <option value="paid">Paid</option>
            <option value="free">Free</option>
          </select>
        </Field>
        <Field label="Paid until" error={errors.paid_until} hint={plan === 'paid' ? 'Last day of the paid plan. Leave empty for no end date.' : 'Only for the paid plan.'}>
          <input type="date" value={paidUntil} disabled={plan !== 'paid'} onChange={(e) => setPaidUntil(e.target.value)} />
        </Field>
      </div>

      <Field label="Your notes" error={errors.notes} hint="Payments, invoice numbers, agreements — never shown to the organization.">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {!o && (
        <fieldset className="fieldset">
          <legend>First admin (optional)</legend>
          <p className="muted small" style={{ margin: '0 0 0.6rem' }}>
            They get a temporary password to sign in with, and set up the rest of the organization’s accounts and facilities themselves.
          </p>
          <div className="field-row">
            <Field label="Name" error={errors['admin.name']}>
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Email" hint="They sign in with this" error={errors['admin.email']}>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        </fieldset>
      )}

      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Save size={18} /> {o ? 'Save changes' : 'Set up organization'}
        </button>
      </div>
    </form>
  )
}
