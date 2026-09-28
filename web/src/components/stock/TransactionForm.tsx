import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ApiError } from '../../lib/api-client'
import {
  NEEDS_COUNTERPARTY,
  OUTBOUND,
  TRANSACTION_TYPES,
  counterpartyLabel,
  formatDate,
  formatQty,
  todayInLagos,
  transactionLabel,
} from '../../lib/format'
import { useRecordTransaction } from '../../lib/queries'
import { Field } from '../form/Field'
import type { BatchStock, Product, ProductStock, TransactionType } from '../../lib/types'

interface Props {
  facilityId: number
  products: Product[]
  stock: ProductStock[]
  /** Pre-select a product, e.g. when opened from that product's row. */
  initialProductId?: number
  onCancel?: () => void
}

type Errors = Record<string, string | undefined>

/** Earliest-expiring batch that can go out: FEFO, skipping expired stock for issues. */
function suggestBatch(batches: BatchStock[], type: TransactionType): string {
  const candidates = batches.filter(
    (b) => b.quantity_on_hand > 0 && !(type === 'issue' && b.expiry_status === 'expired'),
  )
  return candidates[0]?.batch_no ?? ''
}

/**
 * The digital Stock Card entry form — the screen a health worker uses daily
 * (web/CLAUDE.md rule 3). Client checks mirror the backend's rules for fast
 * feedback; the backend (StockLedgerService) is the real gate.
 */
export function TransactionForm({ facilityId, products, stock, initialProductId, onCancel }: Props) {
  const listId = useId()
  const record = useRecordTransaction(facilityId)

  const [productId, setProductId] = useState<number | ''>(initialProductId ?? '')
  const [type, setType] = useState<TransactionType>('issue')
  const [date, setDate] = useState(todayInLagos())
  const [batchNo, setBatchNo] = useState(() =>
    suggestBatch(stock.find((x) => x.product.id === initialProductId)?.batches ?? [], 'issue'),
  )
  const [expiry, setExpiry] = useState('')
  const [quantity, setQuantity] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [voucher, setVoucher] = useState('')
  const [comments, setComments] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [success, setSuccess] = useState<string | null>(null)

  const product = products.find((p) => p.id === productId)
  const productStock = stock.find((s) => s.product.id === productId)
  const batches = productStock?.batches.filter((b) => b.batch_no !== null) ?? []
  const outbound = OUTBOUND.includes(type)
  const tracked = product?.requires_batch_tracking ?? false
  const normalizedBatch = batchNo.trim().toUpperCase()
  const knownBatch = batches.find((b) => b.batch_no === normalizedBatch)
  const onHand = tracked ? knownBatch?.quantity_on_hand : productStock?.quantity_on_hand

  const byCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const p of products) groups.set(p.category, [...(groups.get(p.category) ?? []), p])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [products])

  function selectProduct(id: number | '') {
    setProductId(id)
    const next = stock.find((s) => s.product.id === id)?.batches ?? []
    setBatchNo(OUTBOUND.includes(type) ? suggestBatch(next, type) : '')
    setExpiry('')
    setErrors({})
  }

  function selectType(next: TransactionType) {
    setType(next)
    setBatchNo(OUTBOUND.includes(next) ? suggestBatch(batches, next) : '')
    setExpiry('')
    setErrors({})
  }

  function validate(): Errors {
    const e: Errors = {}
    const qty = Number(quantity)
    if (!product) e.product_id = 'Choose a product.'
    if (tracked && !normalizedBatch) e.batch_no = 'Batch number is required for this product.'
    if (tracked && normalizedBatch && !knownBatch && outbound) e.batch_no = 'This batch is not in stock here.'
    if (tracked && normalizedBatch && !knownBatch && !outbound && !expiry) e.expiry_date = 'Expiry date is required for a new batch.'
    if (quantity === '' || !Number.isInteger(qty) || qty < (type === 'physical_count' ? 0 : 1)) {
      e.quantity = type === 'physical_count' ? 'Enter the counted quantity (0 or more).' : 'Enter a whole number greater than 0.'
    } else if (outbound && onHand !== undefined && qty > onHand) {
      e.quantity = `Only ${formatQty(onHand)} on hand.`
    }
    if (NEEDS_COUNTERPARTY.includes(type) && !counterparty.trim()) e.counterparty = `${counterpartyLabel(type)} is required.`
    if (!date) e.transaction_date = 'Choose a date.'
    return e
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setSuccess(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0 || !product) return

    record.mutate(
      {
        product_id: product.id,
        transaction_type: type,
        quantity: Number(quantity),
        transaction_date: date,
        batch_no: tracked ? normalizedBatch : null,
        expiry_date: tracked && !knownBatch && expiry ? expiry : null,
        counterparty: NEEDS_COUNTERPARTY.includes(type) ? counterparty.trim() : null,
        voucher_no: voucher.trim() || null,
        comments: comments.trim() || null,
      },
      {
        onSuccess: (tx) => {
          setSuccess(
            `${transactionLabel(tx.transaction_type)} of ${formatQty(tx.quantity)} ${product.unit_of_measure} recorded` +
              `${tx.batch_no ? ` (batch ${tx.batch_no})` : ''}. Stock card balance: ${formatQty(tx.running_balance)}.`,
          )
          // Keep product, type, date and counterparty for the next line; clear the rest.
          setQuantity('')
          setVoucher('')
          setComments('')
          if (!outbound) {
            setBatchNo('')
            setExpiry('')
          }
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 422) {
            setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])))
          } else {
            setErrors({ form: err.message })
          }
        },
      },
    )
  }

  const hasExpiredStock = batches.some((b) => b.expiry_status === 'expired' && b.quantity_on_hand > 0)

  return (
    <form className="txn-form" onSubmit={submit} noValidate>
      <div className="field-hint" style={{ marginBottom: '0.45rem', fontWeight: 600 }}>
        Transaction type
      </div>
      <div className="type-picker" role="radiogroup" aria-label="Transaction type">
        {TRANSACTION_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            className={`chip${type === t.value ? ' chip-active' : ''}`}
            onClick={() => selectType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label="Product" error={errors.product_id}>
        <select value={productId} onChange={(e) => selectProduct(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Select a product…</option>
          {byCategory.map(([category, items]) => (
            <optgroup key={category} label={category}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      {tracked && outbound && (
        <Field
          label="Batch"
          error={errors.batch_no}
          hint={type === 'issue' && hasExpiredStock ? "Expired batches can't be issued — record them as a loss." : undefined}
        >
          <select value={normalizedBatch} onChange={(e) => setBatchNo(e.target.value)}>
            <option value="">Select a batch…</option>
            {batches
              .filter((b) => b.quantity_on_hand > 0)
              .map((b) => {
                const expired = b.expiry_status === 'expired'
                return (
                  <option key={b.batch_id} value={b.batch_no ?? ''} disabled={expired && type === 'issue'}>
                    {b.batch_no} · exp {formatDate(b.expiry_date)} · {formatQty(b.quantity_on_hand)} on hand
                    {expired ? ' · EXPIRED' : ''}
                  </option>
                )
              })}
          </select>
        </Field>
      )}

      {tracked && !outbound && (
        <div className="field-row">
          <Field label="Batch number" error={errors.batch_no}>
            <input
              list={`${listId}-batches`}
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Expiry date" error={errors.expiry_date}>
            {knownBatch ? (
              <input value={formatDate(knownBatch.expiry_date)} readOnly />
            ) : (
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            )}
          </Field>
          <datalist id={`${listId}-batches`}>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_no ?? ''} />
            ))}
          </datalist>
        </div>
      )}

      <div className="field-row">
        <Field
          label={type === 'physical_count' ? 'Counted quantity' : 'Quantity'}
          error={errors.quantity}
          hint={onHand !== undefined ? `On hand: ${formatQty(onHand)} ${product?.unit_of_measure ?? ''}` : undefined}
        >
          <input
            type="number"
            inputMode="numeric"
            min={type === 'physical_count' ? 0 : 1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Date" error={errors.transaction_date}>
          <input type="date" value={date} max={todayInLagos()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {NEEDS_COUNTERPARTY.includes(type) && (
        <Field label={counterpartyLabel(type)} error={errors.counterparty}>
          <input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder={type === 'receipt' ? 'e.g. State Central Medical Stores' : 'e.g. OPD Dispensary'}
          />
        </Field>
      )}

      <details className="more-fields" open={!!(errors.voucher_no || errors.comments)}>
        <summary>Voucher &amp; comments</summary>
        <Field label="Voucher no. (optional)" error={errors.voucher_no}>
          <input value={voucher} onChange={(e) => setVoucher(e.target.value)} />
        </Field>
        <Field label="Comments (optional)" error={errors.comments}>
          <textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>
      </details>

      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} />
          {errors.form}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          <CheckCircle2 size={16} />
          {success}
        </p>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {success ? 'Done' : 'Cancel'}
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={record.isPending}>
          {record.isPending ? 'Saving…' : `Record ${transactionLabel(type).toLowerCase()}`}
        </button>
      </div>
    </form>
  )
}
