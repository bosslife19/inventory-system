import { BadgeCheck, Building, CalendarClock, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TemporaryPassword } from '../../components/admin/TemporaryPassword'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { OrganizationForm } from '../../components/owner/OrganizationForm'
import { PlanBadge } from '../../components/owner/PlanBadge'
import { KpiTile } from '../../components/ui/KpiTile'
import { Modal } from '../../components/ui/Modal'
import { formatDate } from '../../lib/format'
import { useOrganizations } from '../../lib/owner-queries'
import type { Organization, User } from '../../lib/types'

/** The owner's console home: every partner organization, its plan and size. */
export function OrganizationsPage() {
  const organizations = useOrganizations()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ org: Organization; admin: User; password: string } | null>(null)

  const rows = organizations.data ?? []
  const paid = rows.filter((o) => o.effective_plan === 'paid' && o.is_active).length
  const due = rows.filter((o) => o.days_left !== null && o.days_left <= 14).length

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Organizations</h1>
          <p className="muted">Partners using the system. Each sees only its own facilities, stock and accounts.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> New organization
          </button>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiTile label="Organizations" value={organizations.isPending ? '—' : rows.length} icon={Building} tone="primary" />
        <KpiTile label="On the paid plan" value={organizations.isPending ? '—' : paid} icon={BadgeCheck} />
        <KpiTile label="Renewal due" value={organizations.isPending ? '—' : due} sub="Paid plans ending within 14 days" icon={CalendarClock} />
      </div>

      <section className="card card-flush">
        {organizations.isError ? (
          <ErrorState error={organizations.error} />
        ) : organizations.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="page-state" style={{ padding: '3rem 1rem' }}>
            <Building size={28} aria-hidden />
            No organizations yet. Set up the first one when a partner signs on.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th className="hide-sm num">Facilities</th>
                  <th className="hide-sm num">Accounts</th>
                  <th className="hide-sm">Since</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="org-cell">
                        <span className="partner-logo">
                          {o.logo_url ? <img src={o.logo_url} alt="" /> : <span aria-hidden>{o.name.slice(0, 1).toUpperCase()}</span>}
                        </span>
                        <div>
                          <Link to={`/owner/organizations/${o.id}`} className="cell-title">
                            {o.name}
                          </Link>
                          <div className="muted small">{o.contact_email ?? o.contact_name ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <PlanBadge organization={o} />
                    </td>
                    <td className="hide-sm num">{o.facility_count}</td>
                    <td className="hide-sm num">{o.user_count}</td>
                    <td className="hide-sm nowrap">{o.created_at ? formatDate(o.created_at.slice(0, 10)) : '—'}</td>
                    <td className="actions">
                      <Link to={`/owner/organizations/${o.id}`} className="btn btn-ghost btn-sm">
                        Manage <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={creating} onClose={() => setCreating(false)} size="lg" title="New organization" icon={<Building size={20} />}>
        {creating && (
          <OrganizationForm
            onCancel={() => setCreating(false)}
            onCreated={(org, admin, password) => {
              setCreating(false)
              if (admin && password) setCreated({ org, admin, password })
              else navigate(`/owner/organizations/${org.id}`)
            }}
          />
        )}
      </Modal>

      <Modal
        open={created !== null}
        onClose={() => setCreated(null)}
        title={created ? `${created.org.name} is set up` : ''}
        description="Send the admin their sign-in details"
      >
        {created && (
          <TemporaryPassword
            user={created.admin}
            password={created.password}
            onClose={() => {
              const id = created.org.id
              setCreated(null)
              navigate(`/owner/organizations/${id}`)
            }}
          />
        )}
      </Modal>
    </div>
  )
}
