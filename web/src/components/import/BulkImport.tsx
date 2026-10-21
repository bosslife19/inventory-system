import type { QueryKey } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Download, FileUp, KeyRound, Upload } from 'lucide-react'
import { useState } from 'react'
import { hasFeature } from '../../lib/plan'
import { useUser } from '../../lib/user-context'
import { LockedAction } from '../plan/Paid'
import { fieldErrors } from '../../lib/api-client'
import { downloadCsv, useImportGuide, useRunImport, type ImportKind, type ImportResult } from '../../lib/import-queries'
import { ErrorState, Loading } from '../layout/PageState'
import { Modal } from '../ui/Modal'

interface Props {
  kind: ImportKind
  /** For product-levels and stock-entries: the facility or store the rows are for. */
  facilityId?: number
  /** What a row is, plural: "products", "accounts"… */
  noun: string
  title: string
  /** One or two sentences on what the import does. */
  intro: React.ReactNode
  /** Queries a committed import changes. */
  invalidates: QueryKey[]
  label?: string
}

/** A ghost "Import CSV" button that opens the import dialog. */
export function BulkImportButton(props: Props) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  if (!hasFeature(user, 'bulk_imports')) return <LockedAction feature="bulk_imports" label={props.label ?? 'Import CSV'} icon={<Upload size={18} />} />

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)} title={`Add many ${props.noun} at once from a CSV file`}>
        <Upload size={18} /> {props.label ?? 'Import CSV'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={props.title} icon={<FileUp size={20} />}>
        {open && <BulkImport {...props} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  )
}

/**
 * Template → fill in → check → import. The check runs every row through the
 * same rules as the single-item form and writes nothing; the import writes
 * every row or, if any is refused, none — so a file is never half imported.
 */
function BulkImport({ kind, facilityId, noun, intro, invalidates, onDone }: Props & { onDone: () => void }) {
  const guide = useImportGuide(kind)
  const run = useRunImport(kind, facilityId, invalidates)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (guide.isError) return <ErrorState error={guide.error} />
  if (guide.isPending) return <Loading />
  const columns = guide.data.columns

  function send(dryRun: boolean) {
    if (!file) return
    setError(null)
    run.mutate(
      { file, dryRun },
      {
        onSuccess: setResult,
        onError: (err) => {
          const e = fieldErrors(err)
          setError(e.file ?? e.form ?? Object.values(e)[0] ?? err.message)
          setResult(null)
        },
      },
    )
  }

  const ready = result !== null && !result.committed && result.failed_rows === 0

  if (result?.committed) {
    const withPasswords = result.rows.filter((r) => r.temporary_password)
    return (
      <div className="stack" style={{ gap: '1rem' }}>
        <p className="form-success" role="status" style={{ margin: 0 }}>
          <CheckCircle2 size={16} /> Imported {result.total_rows} {noun}.
        </p>
        {withPasswords.length > 0 && (
          <>
            <p style={{ margin: 0 }}>
              Give each person their email and temporary password. They’ll choose their own when they first sign in.
            </p>
            <p className="form-error" style={{ margin: 0 }}>
              <KeyRound size={16} /> This is the only time these passwords are shown. Download them now and keep the file safe.
            </p>
            <div className="table-wrap" style={{ maxHeight: '18rem', overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Temporary password</th>
                  </tr>
                </thead>
                <tbody>
                  {withPasswords.map((r) => (
                    <tr key={r.row}>
                      <td>{r.label}</td>
                      <td className="mono">{r.temporary_password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
          {withPasswords.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => downloadCsv('new-accounts.csv', [['account', 'temporary_password'], ...withPasswords.map((r) => [r.label, r.temporary_password])])}
            >
              <Download size={16} /> Download passwords
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const problems = result?.rows.filter((r) => !r.ok) ?? []

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <p style={{ margin: 0 }}>{intro}</p>
      <ol className="muted small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
        <li>Download the template and fill in one row per {noun.replace(/s$/, '')} (Excel or Google Sheets, saved as CSV).</li>
        <li>Choose the file and check it. Nothing is saved yet: you’ll see any row that needs fixing.</li>
        <li>When every row is ready, import. If any row is refused, nothing is imported.</li>
      </ol>

      <details className="more-fields" style={{ margin: 0 }}>
        <summary>Columns ({columns.length})</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Column</th>
                <th>What goes in it</th>
                <th className="hide-sm">Example</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.name}>
                  <td className="nowrap">
                    <span className="mono">{c.name}</span>
                    {c.required && <div className="muted small">required</div>}
                  </td>
                  <td>{c.description}</td>
                  <td className="hide-sm mono small">{c.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Up to {guide.data.max_rows} rows per file. Headers may also be written as words, e.g. “Product code”.</p>
      </details>

      <div className="head-actions">
        <button type="button" className="btn btn-ghost" onClick={() => downloadCsv(`${kind}-template.csv`, [columns.map((c) => c.name)])}>
          <Download size={16} /> Download template
        </button>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
            setError(null)
          }}
          style={{ width: 'auto', flex: '1 1 14rem' }}
        />
      </div>

      {error && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          <AlertCircle size={16} /> {error}
        </p>
      )}

      {result && problems.length > 0 && (
        <>
          <p className="form-error" role="alert" style={{ margin: 0 }}>
            <AlertCircle size={16} /> {problems.length} of {result.total_rows} rows need fixing. Nothing has been imported. Correct
            them in your file, then choose it again and check.
          </p>
          <div className="table-wrap" style={{ maxHeight: '20rem', overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="num">Line</th>
                  <th>Column</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {problems.flatMap((r) =>
                  r.errors.map((e, i) => (
                    <tr key={`${r.row}-${i}`} className="row-critical">
                      <td className="num">{r.row}</td>
                      <td className="mono small">{e.column ?? '—'}</td>
                      <td>{e.message}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ready && (
        <>
          <p className="form-success" role="status" style={{ margin: 0 }}>
            <CheckCircle2 size={16} /> All {result.total_rows} rows are ready to import.
          </p>
          <div className="table-wrap" style={{ maxHeight: '16rem', overflow: 'auto' }}>
            <table className="table">
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row}>
                    <td className="num muted small" style={{ width: '3rem' }}>
                      {r.row}
                    </td>
                    <td>{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        {ready ? (
          <button type="button" className="btn btn-primary" disabled={run.isPending} onClick={() => send(false)}>
            <Upload size={16} /> {run.isPending ? 'Importing…' : `Import ${result.total_rows} ${noun}`}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!file || run.isPending} onClick={() => send(true)}>
            <CheckCircle2 size={16} /> {run.isPending ? 'Checking…' : 'Check file'}
          </button>
        )}
      </div>
    </div>
  )
}
