/**
 * AdminAppRoute (spec 093) — mounts the admin mini-app named by /admin/:appId.
 *
 * Each app screen is lazy-loaded so the admin surfaces stay out of member
 * bundles. An unknown app id redirects to the Control Room — the address bar
 * is not an oracle for which apps exist, and a typo should land somewhere
 * useful rather than 404. Entitlement is NOT checked here: the shell inside
 * each screen owns the access gate, so a denied account gets the standard
 * denied experience (with no admin data fetched) at every depth.
 */
import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'

const APP_SCREENS = {
  'incident-response': lazy(() => import('./apps/IncidentResponseApp')),
  compliance: lazy(() => import('./apps/ComplianceApp')),
  'membership-revenue': lazy(() => import('./apps/MembershipRevenueApp')),
  liquidity: lazy(() => import('./apps/LiquidityApp')),
  'protocol-config': lazy(() => import('./apps/ProtocolConfigApp')),
  maintenance: lazy(() => import('./apps/MaintenanceApp')),
  identity: lazy(() => import('./apps/IdentityApp')),
  'access-control': lazy(() => import('./apps/AccessControlApp')),
  infrastructure: lazy(() => import('./apps/InfrastructureApp')),
}

export default function AdminAppRoute() {
  const { appId } = useParams()
  const Screen = APP_SCREENS[appId]
  if (!Screen) return <Navigate to="/admin" replace />
  return (
    <Suspense
      fallback={
        <div className="admin-panel">
          <p role="status" className="admin-app-loading">Loading…</p>
        </div>
      }
    >
      <Screen />
    </Suspense>
  )
}
