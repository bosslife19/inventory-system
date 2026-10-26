import { AlertCircle, CheckCircle2, CreditCard, Loader2, Receipt, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PaymentTable } from '../../components/billing/PaymentTable'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { useBillingPayments, useBillingPlans, useCheckout, useVerifyPayment } from '../../lib/billing-queries'
import { formatDate, formatNaira, formatQty } from '../../lib/format'
import type { Checkout, Payment, PlanTier, User } from '../../lib/types'

const MONTHS: Checkout['months'][] = [1, 3, 6, 12]

const months = (n: number) => (n === 1 ? '1 month' : `${n} months`)

/**
 * The organization's plan and paying for it through Paystack (admins;
 * docs/API_CONTRACT.md, "Billing"). Paying sends the browser to Paystack's
 * checkout, which comes back here with ?reference=…; the API then confirms
 * the payment with Paystack itself before anything changes.
 */
export function BillingPage({ user }: { user: User }) {
  const o = user.organization!
  const plans = useBillingPlans()
  const payments = useBillingPayments()
  const checkout = useCheckout()
  const [term, setTerm] = useState<Checkout['months']>(1)
  const [paying, setPaying] = useState<number | null>(null)
  const noEndDate = o.plan === 'paid' && o.paid_until === null

  function pay(tier: PlanTier) {
    setPaying(tier.id)
    checkout.mutate(
      { plan_tier_id: tier.id, months: term },
      {
        onSuccess: (res) => window.location.assign(res.authorization_url),
        onError: () => setPaying(null),
      },
    )
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Billing</h1>
          <p className="muted">{o.name}’s plan. Payments go securely through Paystack — card, bank transfer or USSD.</p>
        </div>
      </header>

      <PaymentReturn />

      <CurrentPlan user={user} />

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Choose a plan</h2>
            <p>
              Every plan has dispatches, reorder requests, delivery scanning, push notifications and bulk imports. They
              differ in how many facilities and accounts you can have.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Pay for">
            {MONTHS.map((m) => (
              <button key={m} type="button" aria-pressed={term === m} onClick={() => setTerm(m)}>
                {months(m)}
              </button>
            ))}
          </div>
        </div>

        {noEndDate && (
          <p className="notice-line">
            <ShieldCheck size={16} aria-hidden /> Your paid plan has no end date, so there’s nothing to pay for here.
          </p>
        )}

        {plans.isError ? (
          <ErrorState error={plans.error} />
        ) : plans.isPending ? (
          <Loading />
        ) : plans.data.length === 0 ? (
          <div className="page-state">No plans are on offer right now. Contact the platform owner.</div>
        ) : (
          <div className="tier-grid">
            {plans.data.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                term={term}
                user={user}
                disabled={noEndDate || checkout.isPending}
                busy={checkout.isPending && paying === tier.id}
                onPay={() => pay(tier)}
              />
            ))}
          </div>
        )}

        {checkout.isError && (
          <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>
            <AlertCircle size={16} /> {checkout.error.message}
          </p>
        )}
        <p className="muted small" style={{ margin: '1rem 0 0' }}>
          Paying for the plan you’re on adds the months after its current end date. Switching plans starts today, and
          the days left on your current plan are converted into days on the new one. Nothing renews automatically.
        </p>
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <div>
            <h2>Payments</h2>
            <p>Your organization’s payments, newest first</p>
          </div>
        </div>
        {payments.isError ? (
          <ErrorState error={payments.error} />
        ) : payments.isPending ? (
          <Loading />
        ) : payments.data.length === 0 ? (
          <div className="page-state" style={{ padding: '2.5rem 1rem' }}>
            <Receipt size={28} aria-hidden />
            No payments yet.
          </div>
        ) : (
          <PaymentTable payments={payments.data} />
        )}
      </section>
    </div>
  )
}

/** What the organization is on now, and how much of it is used. */
function CurrentPlan({ user }: { user: User }) {
  const o = user.organization!
  const limits = o.limits
  const name = o.plan === 'free' ? 'Free' : (o.tier?.name ?? 'Paid')

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Current plan</h2>
          <p>
            {o.plan === 'free'
              ? 'Stock Cards, dashboards, alerts and reports, for one facility and one account per role.'
              : o.paid_until
                ? `Paid to ${formatDate(o.paid_until)} — ${o.days_left === 1 ? 'last day today' : `${o.days_left} days left`}.`
                : 'Paid, with no end date.'}
          </p>
        </div>
        <span className={`badge ${o.plan === 'free' ? 'badge-neutral' : o.renewal_due ? 'badge-warning' : 'badge-ok'}`}>
          {name}
        </span>
      </div>
      <div className="usage-grid">
        <Usage
          label="Open facilities"
          used={limits?.facilities_in_use}
          max={limits ? limits.max_facilities : null}
          note={limits ? undefined : 'No limit on your plan'}
        />
        <Usage
          label="Active accounts"
          used={limits?.accounts_in_use}
          max={limits?.max_accounts ?? null}
          note={!limits ? 'No limit on your plan' : o.plan === 'free' ? 'One per role on the free plan' : undefined}
        />
      </div>
    </section>
  )
}

function Usage({ label, used, max, note }: { label: string; used?: number; max: number | null; note?: string }) {
  const pct = used !== undefined && max ? Math.min(100, Math.round((used / max) * 100)) : null
  const tone = pct === null ? '' : pct >= 100 ? ' is-full' : pct >= 80 ? ' is-near' : ''

  return (
    <div className="usage">
      <div className="usage-head">
        <span>{label}</span>
        <strong>
          {used === undefined ? '—' : formatQty(used)}
          {max !== null && <span className="muted"> of {formatQty(max)}</span>}
        </strong>
      </div>
      {pct !== null && (
        <div
          className={`meter${tone}`}
          role="meter"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={max ?? undefined}
          aria-label={label}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {(note || max === null) && <p className="muted small">{note ?? 'No limit'}</p>}
    </div>
  )
}

function TierCard({
  tier,
  term,
  user,
  disabled,
  busy,
  onPay,
}: {
  tier: PlanTier
  term: number
  user: User
  disabled: boolean
  busy: boolean
  onPay: () => void
}) {
  const o = user.organization!
  const current = o.plan === 'paid' && o.tier?.id === tier.id
  const limits = o.limits
  // A smaller plan than what's in use: kept, but nothing more can be added.
  const over = [
    tier.max_facilities !== null && limits && limits.facilities_in_use > tier.max_facilities
      ? `${formatQty(limits.facilities_in_use)} open facilities`
      : null,
    tier.max_accounts !== null && limits && limits.accounts_in_use > tier.max_accounts
      ? `${formatQty(limits.accounts_in_use)} active accounts`
      : null,
  ].filter(Boolean)

  return (
    <article className={`tier-card${current ? ' is-current' : ''}`}>
      <div className="tier-top">
        <h3>{tier.name}</h3>
        {current && <span className="badge badge-ok">Your plan</span>}
      </div>
      {tier.description && <p className="muted small">{tier.description}</p>}
      <p className="tier-price">
        {formatNaira(tier.monthly_price)}
        <span> / month</span>
      </p>
      <ul className="tier-limits">
        <li>
          {tier.max_facilities === null ? 'Unlimited facilities' : `Up to ${formatQty(tier.max_facilities)} facilities`}
        </li>
        <li>{tier.max_accounts === null ? 'Unlimited accounts' : `Up to ${formatQty(tier.max_accounts)} accounts`}</li>
        <li>Every paid feature</li>
      </ul>
      {over.length > 0 && (
        <p className="tier-warning">
          You have {over.join(' and ')} — more than this plan allows. You keep them, but can’t add more until you’re
          under the limit.
        </p>
      )}
      <div className="tier-foot">
        <span className="muted small">
          {months(term)}: <strong className="tier-total">{formatNaira(tier.monthly_price * term)}</strong>
        </span>
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onPay}>
          {busy ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />}{' '}
          {current ? 'Renew' : o.plan === 'paid' ? 'Switch' : 'Upgrade'}
        </button>
      </div>
    </article>
  )
}

/** Back from Paystack (?reference=…): confirm the payment once and say how it went. */
function PaymentReturn() {
  const [params, setParams] = useSearchParams()
  const reference = params.get('reference') ?? params.get('trxref')
  const verify = useVerifyPayment()
  const [result, setResult] = useState<Payment | null>(null)
  const started = useRef<string | null>(null)

  useEffect(() => {
    if (!reference || started.current === reference) return
    started.current = reference
    verify.mutate(reference, {
      onSuccess: (payment) => {
        setResult(payment)
        // Keep the address clean so a reload doesn't ask again.
        setParams({}, { replace: true })
      },
    })
  }, [reference, verify, setParams])

  if (verify.isPending) {
    return (
      <div className="payment-result" role="status">
        <Loader2 size={20} className="spin" aria-hidden /> Confirming your payment with Paystack…
      </div>
    )
  }
  if (verify.isError) {
    return (
      <div className="payment-result is-failed" role="alert">
        <AlertCircle size={20} aria-hidden />
        <span>
          We couldn’t confirm the payment yet: {verify.error.message} If you were charged, it will show here once
          Paystack tells us.
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => reference && verify.mutate(reference, { onSuccess: setResult })}
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    )
  }
  if (!result) return null

  if (result.status === 'success') {
    return (
      <div className="payment-result is-ok" role="status">
        <CheckCircle2 size={20} aria-hidden />
        <span>
          Payment received — {formatNaira(result.amount)} for the <strong>{result.plan_tier.name}</strong> plan. You’re
          paid up to {formatDate(result.period_end)}
          {result.credit_days > 0 ? `, including ${result.credit_days} days carried over from your previous plan` : ''}.
        </span>
      </div>
    )
  }
  if (result.status === 'pending') {
    return (
      <div className="payment-result" role="status">
        <Loader2 size={20} aria-hidden />
        <span>
          Paystack hasn’t confirmed this payment yet (bank transfers can take a few minutes). It will show below once it
          does.
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => verify.mutate(result.reference, { onSuccess: setResult })}
        >
          <RefreshCw size={14} /> Check again
        </button>
      </div>
    )
  }

  return (
    <div className="payment-result is-failed" role="alert">
      <AlertCircle size={20} aria-hidden />
      <span>
        The payment didn’t go through{result.failure_reason ? ` (${result.failure_reason})` : ''}. You haven’t been
        charged for it — you can try again below.
      </span>
    </div>
  )
}
