import { Lock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { FEATURE_LABEL } from '../../lib/plan'
import { usePlatform } from '../../lib/owner-queries'
import type { Feature } from '../../lib/types'
import { Modal } from '../ui/Modal'

/** Says what the paid plan adds and who to ask. */
function UpgradeNote({ feature }: { feature: Feature }) {
  const owner = usePlatform().data?.name ?? 'the platform owner'

  return (
    <div className="upgrade-note">
      <p>
        <strong>{FEATURE_LABEL[feature]}</strong> {FEATURE_LABEL[feature].endsWith('s') ? 'are' : 'is'} part of the paid plan. Your
        Stock Cards, dashboards, alerts and reports keep working on the free plan.
      </p>
      <p className="muted">Ask your organization’s admin to contact {owner} to upgrade. Nothing you have recorded is lost either way.</p>
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
  /** Why it's locked right now, when that's more than the plan lacking it (e.g. a free-plan limit reached). */
  reason?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className={`${className} btn-locked`} onClick={() => setOpen(true)} title="Part of the paid plan">
        {icon} {label} <Lock size={13} aria-label="Paid plan" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} description="Paid plan" icon={<Sparkles size={20} />}>
        {reason && <p style={{ margin: '0 0 0.9rem' }}>{reason}</p>}
        <UpgradeNote feature={feature} />
        <div className="head-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            OK
          </button>
        </div>
      </Modal>
    </>
  )
}

