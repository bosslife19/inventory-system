import { AlertCircle, KeyRound, Pencil, Power, Search, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { TemporaryPassword } from '../../components/admin/TemporaryPassword'
import { UserForm } from '../../components/admin/UserForm'
import { BulkImportButton } from '../../components/import/BulkImport'
import { LockedAction } from '../../components/plan/Paid'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { Modal } from '../../components/ui/Modal'
import { type UserFilters, useResetPassword, useUpdateUser, useUsers } from '../../lib/admin-queries'
import { manageableRoles } from '../../lib/auth'
import { ROLE_LABEL, formatQty } from '../../lib/format'
import { roleInUse } from '../../lib/plan'
import type { User, UserRole } from '../../lib/types'

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: User }
  | { kind: 'confirm'; action: 'deactivate' | 'reactivate' | 'reset'; user: User }
  | { kind: 'password'; user: User; password: string }

const STATUS: { value: boolean | undefined; label: string }[] = [
  { value: true, label: 'Active' },
  { value: false, label: 'Deactivated' },
  { value: undefined, label: 'All' },
]

/** Who the signed-in user manages, in words, for the page subtitle. */
function scopeLine(me: User): string {
  switch (me.role) {
    case 'admin':
      return 'Every account in the system'
    case 'federal_officer':
      return 'State officers across Nigeria'
    case 'state_officer':
      return `LGA officers in ${me.node.name} State`
    default:
      return `Facility staff in ${me.node.name} LGA`
  }
}

/**
 * Accounts the signed-in user manages (docs/API_CONTRACT.md, "Users"):
 * admins everyone, officers the level below in their area. Accounts are
 * deactivated, never deleted; passwords handed out are temporary.
 */
export function UsersPage({ me }: { me: User }) {
  const roles = manageableRoles(me)
  // Free plan: one active account per role, so there may be nothing left to create.
  const allRolesInUse = roles.every((r) => roleInUse(me, r))
  const [filters, setFilters] = useState<UserFilters>({ is_active: true, page: 1, per_page: 25 })
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const users = useUsers(filters)
  const update = useUpdateUser()
  const reset = useResetPassword()

  const rows = users.data?.data ?? []
  const pagination = users.data?.meta.pagination
  const close = () => {
    setDialog(null)
    update.reset()
    reset.reset()
  }
  const actionError = (update.error ?? reset.error)?.message
  // Free plan: someone else already holds the role this account would come back to.
  const reactivateBlocked = dialog?.kind === 'confirm' && dialog.action === 'reactivate' && roleInUse(me, dialog.user.role)

  function confirm(action: 'deactivate' | 'reactivate' | 'reset', user: User) {
    if (action === 'reset') {
      reset.mutate(user.id, { onSuccess: (res) => setDialog({ kind: 'password', user: res.data, password: res.temporary_password }) })
    } else {
      update.mutate({ id: user.id, body: { is_active: action === 'reactivate' } }, { onSuccess: close })
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Accounts</h1>
          <p className="muted">{scopeLine(me)}</p>
        </div>
        <div className="head-actions">
          <BulkImportButton
            kind="users"
            noun="accounts"
            title="Import accounts"
            intro="Create many accounts at once, on temporary passwords shown once at the end. You can only create the roles, and places, you manage."
            invalidates={[['users']]}
          />
          {allRolesInUse ? (
            <LockedAction
              feature="multiple_accounts"
              label="New account"
              icon={<UserPlus size={18} />}
              className="btn btn-primary"
              reason={`The free plan has one active account per role, and ${
                roles.length === 1 ? `the ${ROLE_LABEL[roles[0]].toLowerCase()} account is` : 'every role you can create is'
              } already in use. Deactivate an account to give its place to someone else.`}
            />
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'create' })}>
              <UserPlus size={18} /> New account
            </button>
          )}
        </div>
      </header>

      <section className="card card-flush">
        <div className="card-head">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={filters.is_active === s.value}
                onClick={() => setFilters({ ...filters, is_active: s.value, page: 1 })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="filters">
            {roles.length > 1 && (
              <select
                aria-label="Role"
                value={filters.role ?? ''}
                onChange={(e) => setFilters({ ...filters, role: (e.target.value || undefined) as UserRole | undefined, page: 1 })}
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault()
                setFilters({ ...filters, q: query.trim() || undefined, page: 1 })
              }}
            >
              <Search size={16} />
              <input
                type="search"
                placeholder="Search name or email…"
                aria-label="Search accounts"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (!e.target.value) setFilters({ ...filters, q: undefined, page: 1 })
                }}
              />
            </form>
          </div>
        </div>

        {users.isError ? (
          <ErrorState error={users.error} />
        ) : users.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Users size={28} aria-hidden />
            {filters.q ? 'No accounts match that search.' : 'No accounts here yet.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="hide-sm">Assigned to</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-title">{u.name}</div>
                      <div className="muted small">{u.email}</div>
                    </td>
                    <td className="nowrap">{ROLE_LABEL[u.role]}</td>
                    <td className="hide-sm small">{u.node.path.join(' › ')}</td>
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
                    <td className="num nowrap">
                      <button type="button" className="btn btn-icon" aria-label={`Edit ${u.name}`} title="Edit" onClick={() => setDialog({ kind: 'edit', user: u })}>
                        <Pencil size={16} />
                      </button>
                      {u.is_active && (
                        <button
                          type="button"
                          className="btn btn-icon"
                          aria-label={`Reset password for ${u.name}`}
                          title="Reset password"
                          onClick={() => setDialog({ kind: 'confirm', action: 'reset', user: u })}
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.name}`}
                        title={u.is_active ? 'Deactivate' : 'Reactivate'}
                        onClick={() => setDialog({ kind: 'confirm', action: u.is_active ? 'deactivate' : 'reactivate', user: u })}
                      >
                        <Power size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.last_page > 1 && (
          <nav className="pager" aria-label="Pages" style={{ padding: '0 1.25rem 1.1rem' }}>
            <button type="button" className="btn btn-ghost" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
              ← Previous
            </button>
            <span className="muted">
              Page {pagination.current_page} of {pagination.last_page} · {formatQty(pagination.total)} accounts
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={filters.page >= pagination.last_page}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Next →
            </button>
          </nav>
        )}
      </section>

      <Modal
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        onClose={close}
        size="lg"
        title={dialog?.kind === 'edit' ? `Edit ${dialog.user.name}` : 'New account'}
        icon={<UserPlus size={20} />}
      >
        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <UserForm
            me={me}
            user={dialog.kind === 'edit' ? dialog.user : undefined}
            onCreated={(user, password) => setDialog({ kind: 'password', user, password })}
            onSaved={close}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'confirm'}
        onClose={close}
        title={
          dialog?.kind === 'confirm'
            ? { deactivate: 'Deactivate account?', reactivate: 'Reactivate account?', reset: 'Reset password?' }[dialog.action]
            : ''
        }
        icon={dialog?.kind === 'confirm' && dialog.action === 'reset' ? <KeyRound size={20} /> : <Power size={20} />}
      >
        {dialog?.kind === 'confirm' && (
          <div className="stack" style={{ gap: '1rem' }}>
            <p style={{ margin: 0 }}>
              {dialog.action === 'deactivate' &&
                `${dialog.user.name} will be signed out on every device and won’t be able to sign in. Their Stock Card entries stay as they are. You can reactivate the account later.`}
              {dialog.action === 'reactivate' &&
                (reactivateBlocked
                  ? `The free plan has one active ${ROLE_LABEL[dialog.user.role].toLowerCase()} account, and another is in use. Deactivate that one first, or ask the platform owner to upgrade your organization.`
                  : `${dialog.user.name} will be able to sign in again with their existing password.`)}
              {dialog.action === 'reset' &&
                `${dialog.user.name} will be signed out everywhere and given a new temporary password, which you’ll pass on to them.`}
            </p>
            {actionError && (
              <p className="form-error" role="alert">
                <AlertCircle size={16} /> {actionError}
              </p>
            )}
            <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className={dialog.action === 'deactivate' ? 'btn btn-dark' : 'btn btn-primary'}
                disabled={update.isPending || reset.isPending || reactivateBlocked}
                onClick={() => confirm(dialog.action, dialog.user)}
              >
                {{ deactivate: 'Deactivate', reactivate: 'Reactivate', reset: 'Reset password' }[dialog.action]}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={dialog?.kind === 'password'} onClose={close} title="Temporary password" icon={<KeyRound size={20} />}>
        {dialog?.kind === 'password' && <TemporaryPassword user={dialog.user} password={dialog.password} onClose={close} />}
      </Modal>
    </div>
  )
}
