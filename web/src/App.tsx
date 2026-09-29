import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth'
import { AppShell } from './components/layout/AppShell'
import { homePath } from './lib/auth'
import { useUser } from './lib/user-context'
import { AlertsPage } from './routes/alerts/AlertsPage'
import { DeliveryNotesPage } from './routes/delivery-notes/DeliveryNotesPage'
import { FederalPage } from './routes/federal/FederalPage'
import { LgaPage } from './routes/lga/LgaPage'
import { LoginPage } from './routes/login/LoginPage'
import { FacilityPage } from './routes/sdp/FacilityPage'
import { StatePage } from './routes/state/StatePage'

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
      return <FederalPage />
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

function Shell() {
  return <AppShell user={useUser()} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/delivery-notes" element={<Deliveries />} />
        <Route path="/facilities/:id/delivery-notes" element={<Deliveries />} />
        <Route path="/facilities/:id" element={<ById page="facility" />} />
        <Route path="/lgas/:id" element={<ById page="lga" />} />
        <Route path="/states/:id" element={<ById page="state" />} />
        <Route path="*" element={<div className="page-state">Page not found.</div>} />
      </Route>
    </Routes>
  )
}
