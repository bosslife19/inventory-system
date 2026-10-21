import { AlertCircle, ImageUp, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useLogo } from '../../lib/owner-queries'

/** Upload, replace or remove a logo: the platform's own, or an organization's. */
export function LogoUpload({ target, logoUrl, name }: { target: 'platform' | number; logoUrl: string | null; name: string }) {
  const logo = useLogo(target)
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="logo-upload">
      <div className="logo-preview">{logoUrl ? <img src={logoUrl} alt={`${name} logo`} /> : <span className="muted small">No logo</span>}</div>
      <div className="stack" style={{ gap: '0.5rem' }}>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" disabled={logo.isPending} onClick={() => input.current?.click()}>
            <ImageUp size={17} /> {logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button type="button" className="btn btn-ghost" disabled={logo.isPending} onClick={() => logo.mutate(null)}>
              <Trash2 size={17} /> Remove
            </button>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          PNG, JPG or WebP, up to 1 MB. A wide logo on a transparent or white background looks best.
        </p>
        {logo.isError && (
          <p className="form-error" role="alert">
            <AlertCircle size={16} /> {logo.error.message}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) logo.mutate(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
