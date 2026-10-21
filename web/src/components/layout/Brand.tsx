import { Boxes } from 'lucide-react'
import { usePlatform } from '../../lib/owner-queries'
import type { Membership } from '../../lib/types'

/** The platform's mark and name: the owner's logo once uploaded, else the default mark. */
export function Brand({ tagline }: { tagline?: string }) {
  const platform = usePlatform().data

  return (
    <>
      {platform?.logo_url ? (
        <img className="brand-logo" src={platform.logo_url} alt="" />
      ) : (
        <span className="brand-mark" aria-hidden>
          <Boxes size={18} />
        </span>
      )}
      <span className="nav-text">
        {platform?.name ?? 'Stock Card'}
        <small>{tagline ?? platform?.tagline ?? 'Health supply chain · Nigeria'}</small>
      </span>
    </>
  )
}

/** The member's organization beside the platform's brand: its logo on a light tile (logos are made for white), and its name. */
export function PartnerBadge({ organization }: { organization: Membership }) {
  return (
    <div className="partner-badge" title={organization.name}>
      <span className="partner-logo">
        {organization.logo_url ? (
          <img src={organization.logo_url} alt="" />
        ) : (
          <span aria-hidden>{organization.name.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="nav-text">
        <small>In partnership with</small>
        {organization.name}
      </span>
    </div>
  )
}
