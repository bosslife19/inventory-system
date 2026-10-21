import { AlertCircle, CheckCircle2, Save } from 'lucide-react'
import { useState } from 'react'
import { Field } from '../../components/form/Field'
import { ErrorState, Loading } from '../../components/layout/PageState'
import { LogoUpload } from '../../components/owner/LogoUpload'
import { fieldErrors } from '../../lib/api-client'
import { usePlatform, useSavePlatform } from '../../lib/owner-queries'
import type { Platform } from '../../lib/types'

/** The owner's own branding: on the sign-in pages, and beside every organization's logo. */
export function PlatformPage() {
  const platform = usePlatform()

  if (platform.isError) return <ErrorState error={platform.error} />
  if (platform.isPending) return <Loading />

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Your branding</h1>
          <p className="muted">Shown on the sign-in pages, and next to each organization’s logo in the dashboard and the app.</p>
        </div>
      </header>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Name</h2>
            </div>
          </div>
          <NameForm platform={platform.data} />
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Logo</h2>
            </div>
          </div>
          <LogoUpload target="platform" logoUrl={platform.data.logo_url} name={platform.data.name} />
        </section>
      </div>
    </div>
  )
}

function NameForm({ platform }: { platform: Platform }) {
  const save = useSavePlatform()
  const [name, setName] = useState(platform.name)
  const [tagline, setTagline] = useState(platform.tagline)
  const [errors, setErrors] = useState<Record<string, string>>({})

  return (
    <form
      noValidate
      className="stack"
      style={{ gap: '0.9rem' }}
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return setErrors({ name: 'Enter a name.' })
        setErrors({})
        save.mutate({ name: name.trim(), tagline: tagline.trim() || null }, { onError: (err) => setErrors(fieldErrors(err)) })
      }}
    >
      <Field label="Platform name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Tagline" error={errors.tagline} hint="Under the name on the sign-in page">
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} />
      </Field>
      {errors.form && (
        <p className="form-error" role="alert">
          <AlertCircle size={16} /> {errors.form}
        </p>
      )}
      {save.isSuccess && (
        <p className="form-success" role="status" style={{ margin: 0 }}>
          <CheckCircle2 size={16} /> Saved.
        </p>
      )}
      <div className="head-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          <Save size={18} /> Save
        </button>
      </div>
    </form>
  )
}
