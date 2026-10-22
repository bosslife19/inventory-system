import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth'
import { AppShell } from './components/layout/AppShell'
import { OwnerShell } from './components/layout/OwnerShell'
import { homePath, manageableRoles } from './lib/auth'
import { useUser } from './lib/user-context'
import { AccountPage } from './routes/account/AccountPage'
import { ActivityPage } from './routes/activity/ActivityPage'
import { FacilitiesPage } from './routes/admin/FacilitiesPage'
import { ProductsPage } from './routes/admin/ProductsPage'
import { UsersPage } from './routes/admin/UsersPage'
import { AlertsPage } from './routes/alerts/AlertsPage'
import { DeliveryNotesPage } from './routes/delivery-notes/DeliveryNotesPage'
import { FederalPage } from './routes/federal/FederalPage'
import { LgaPage } from './routes/lga/LgaPage'
import { LoginPage } from './routes/login/LoginPage'
import { SignupPage } from './routes/login/SignupPage'
import { OrganizationPage } from './routes/owner/OrganizationPage'
import { OrganizationsPage } from './routes/owner/OrganizationsPage'
import { PlatformPage } from './routes/owner/PlatformPage'
import { ReportsPage } from './routes/reports/ReportsPage'
import { FacilityPage } from './routes/sdp/FacilityPage'
import { StatePage } from './routes/state/StatePage'
import { StockLevelsPage } from './routes/sdp/StockLevelsPage'

// One dashboard shell, role-driven routing (web/CLAUDE.md rule 1). Access is
// enforced by the API; these routes only decide what to show.

type Level = 'sdp' | 'lga' | 'state' | 'federal'

/** Own-node landing page for each role; anyone else is sent to their own home. */
function Home({ level }: { level?: Level }) {
  const user = useUser()
  if (!level || homePath(user) !== `/${level}`) return <Navigate to={homePath(user)} replace />

  switch (level) {
    case 'sdp':
      return <FacilityPage facilityId={user.facility_id!} user={user} />
    case 'lga':
      return <LgaPage lgaId={user.lga_id!} user={user} />
    case 'state':
      return <StatePage stateId={user.state_id!} user={user} />
    case 'federal':
      return <FederalPage user={user} />
  }
}

/** Drill-down pages by id (e.g. an LGA officer opening one of their facilities). */
function ById({ page }: { page: 'facility' | 'lga' | 'state' }) {
  const user = useUser()
  const id = Number(useParams().id)

  switch (page) {
    case 'facility':
      return <FacilityPage key={id} facilityId={id} user={user} />
    case 'lga':
      return <LgaPage key={id} lgaId={id} user={user} />
    case 'state':
      return <StatePage key={id} stateId={id} user={user} />
  }
}

/** Delivery notes: own facility for facility staff, or a facility's from a drill-down. */
function Deliveries() {
  const user = useUser()
  const id = useParams().id
  const facilityId = id ? Number(id) : user.facility_id
  if (facilityId == null) return <Navigate to={homePath(user)} replace />
  return <DeliveryNotesPage key={facilityId} facilityId={facilityId} user={user} />
}

/** Administration screens: accounts for anyone who manages some, facilities for admins. */
function Admin({ page }: { page: 'users' | 'facilities' }) {
  const user = useUser()
  const allowed = page === 'users' ? manageableRoles(user).length > 0 : user.role === 'admin'
  if (!allowed) return <Navigate to={homePath(user)} replace />

  switch (page) {
    case 'users':
      return <UsersPage me={user} />
    case 'facilities':
      return <FacilitiesPage />
  }
}

/** The shared catalog: every level may add products. */
function Products() {
  return <ProductsPage me={useUser()} />
}

/** A facility's own min / EOP / max: your own facility or store, or one you drilled into. */
function Levels() {
  const user = useUser()
  const id = useParams().id
  const facilityId = id ? Number(id) : (user.facility_id ?? user.store?.id ?? null)
  if (facilityId == null) return <Navigate to="/products" replace />
  return <StockLevelsPage key={facilityId} facilityId={facilityId} user={user} />
}

function Reports() {
  return <ReportsPage user={useUser()} />
}

function Account() {
  return <AccountPage user={useUser()} />
}

/** The owner's console: organizations and the platform's branding, for the platform owner only. */
function Owner({ page }: { page: 'organizations' | 'organization' | 'platform' }) {
  const user = useUser()
  const id = Number(useParams().id)
  if (user.role !== 'owner') return <Navigate to={homePath(user)} replace />

  switch (page) {
    case 'organizations':
      return <OrganizationsPage />
    case 'organization':
      return <OrganizationPage key={id} id={id} />
    case 'platform':
      return <PlatformPage />
  }
}

function Shell() {
  const user = useUser()
  return user.role === 'owner' ? <OwnerShell user={user} /> : <AppShell user={user} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="/sdp" element={<Home level="sdp" />} />
        <Route path="/lga" element={<Home level="lga" />} />
        <Route path="/state" element={<Home level="state" />} />
        <Route path="/federal" element={<Home level="federal" />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/account" element={<Account />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/admin/users" element={<Admin page="users" />} />
        <Route path="/products" element={<Products />} />
        <Route path="/admin/products" element={<Navigate to="/products" replace />} />
        <Route path="/levels" element={<Levels />} />
        <Route path="/facilities/:id/levels" element={<Levels />} />
        <Route path="/admin/facilities" element={<Admin page="facilities" />} />
        <Route path="/delivery-notes" element={<Deliveries />} />
        <Route path="/facilities/:id/delivery-notes" element={<Deliveries />} />
        <Route path="/facilities/:id" element={<ById page="facility" />} />
        <Route path="/lgas/:id" element={<ById page="lga" />} />
        <Route path="/states/:id" element={<ById page="state" />} />
        <Route path="/owner" element={<Owner page="organizations" />} />
        <Route path="/owner/organizations/:id" element={<Owner page="organization" />} />
        <Route path="/owner/platform" element={<Owner page="platform" />} />
        <Route path="*" element={<div className="page-state">Page not found.</div>} />
      </Route>
    </Routes>
  )
}
