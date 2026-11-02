import { CheckCircle2 } from 'lucide-react'
import doctorTablet from '../../assets/auth/doctor-tablet.jpg'
import nurses from '../../assets/auth/nurses.jpg'
import { Brand } from '../../components/layout/Brand'

const POINTS = ['Digital Stock Cards', 'Live rollups to Federal', 'Stock-out and expiry flags']

const PHOTOS = {
  nurses: { src: nurses, alt: 'Two nurses in green scrubs smiling on a hospital ward' },
  doctorTablet: { src: doctorTablet, alt: 'A doctor in a white coat smiling at a tablet' },
}

/** The sign-in family of screens: a photo with the product's pitch, and the form on a dark panel. */
export function AuthLayout({ photo = 'nurses', children }: { photo?: keyof typeof PHOTOS; children: React.ReactNode }) {
  return (
    <div className="login">
      <aside className={`login-hero login-hero-${photo}`}>
        <img src={PHOTOS[photo].src} alt={PHOTOS[photo].alt} />
        <div className="login-hero-copy">
          <h2>Health commodity visibility, from facility to federal.</h2>
          <ul className="login-points">
            {POINTS.map((p) => (
              <li key={p}>
                <CheckCircle2 size={15} /> {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="login-panel">
        <div className="brand">
          <Brand />
        </div>
        <div className="login-panel-body">{children}</div>
        <div className="login-foot">National health supply chain inventory · Nigeria</div>
      </div>
    </div>
  )
}
