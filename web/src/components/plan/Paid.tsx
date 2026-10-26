import { CreditCard, Lock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURE_LABEL, onPaidPlan } from '../../lib/plan'
import { usePlatform } from '../../lib/owner-queries'
import { useUser } from '../../lib/user-context'
import type { Feature } from '../../lib/types'
import { Modal } from '../ui/Modal'

/** Says what the paid plan adds and how to get it: admins pay on the Billing page, everyone else asks them. */
function UpgradeNote({ feature }: { feature: Feature }) {
  const owner = usePlatform().data?.name ?? 'the platform owner'
  const user = useUser()
  const isAdmin = user.role === 'admin'
  // On a paid tier the feature is there; what's locked is a limit of the tier.
  const paid = onPaidPlan(user)

  return (
    <div className="upgrade-note">
      {paid ? (
        <p>
          Your organization is on the <strong>{user.organization?.tier?.name ?? 'paid'}</strong> plan. A bigger plan allows more
          facilities and accounts.
        </p>
      ) : (
        <p>
          <strong>{FEATURE_LABEL[feature]}</strong> {FEATURE_LABEL[feature].endsWith('s') ? 'are' : 'is'} part of the paid plan. Your
          Stock Cards, dashboards, alerts and reports keep working on the free plan.
        </p>
      )}
      <p className="muted">
        {isAdmin
          ? 'You can compare plans and pay online on the Billing page.'
          : `Ask your organization’s admin to upgrade on the Billing page, or to contact ${owner}.`}{' '}
        Nothing you have recorded is lost either way.
      </p>
    </div>
  )
}

/**
 * Stands in for an action the plan doesn't include: the same button with a
 * lock, opening a short explanation instead.
 */
export function LockedAction({
  feature,
  label,
  icon,
  className = 'btn btn-ghost',
  reason,
}: {
  feature: Feature
  label: string
  icon?: React.ReactNode
  className?: string
  /** Why it's locked right now, when that's more than the plan lacking it (e.g. a free-plan or tier limit reached). */
  reason?: string
}) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const isAdmin = user.role === 'admin'
  const hint = onPaidPlan(user) ? 'Your plan’s limit' : 'Part of the paid plan'

  return (
    <>
      <button type="button" className={`${className} btn-locked`} onClick={() => setOpen(true)} title={hint}>
        {icon} {label} <Lock size={13} aria-label={hint} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} description={onPaidPlan(user) ? 'Plan limit' : 'Paid plan'} icon={<Sparkles size={20} />}>
        {reason && <p style={{ margin: '0 0 0.9rem' }}>{reason}</p>}
        <UpgradeNote feature={feature} />
        <div className="head-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          {isAdmin ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Not now
              </button>
              <Link to="/billing" className="btn btn-primary" onClick={() => setOpen(false)}>
                <CreditCard size={16} /> See plans
              </Link>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              OK
            </button>
          )}
        </div>
      </Modal>
    </>
  )
}

