/**
 * AdminAppShell (spec 093) — the chrome every admin mini-app renders inside.
 *
 * Owns, once, everything the monolithic AdminPanel's shell used to own:
 * the entry gate (via AdminAccessGate — a deep link never reaches a softer
 * gate than the front door), the app header with its back link to the
 * Control Room, the collapsible view rail (PortalNav in 'tabs' mode with the
 * exact mobile behaviour the panel had: starts collapsed on mobile, backdrop
 * dismiss, Escape closes, selecting collapses), and `?view=` resolution.
 *
 * The URL is the only view state (spec FR-008): the rail writes
 * `?view=<id>` through the router, so views are shareable and back/forward
 * work. An unknown or unentitled view renders the dashboard rather than an
 * error — the address bar is not an oracle for what exists.
 *
 * The shell renders a view ONLY when that view's own gate passes
 * (render gate ≡ config gate, the least-privilege invariant), and redirects
 * to /admin when the whole app is unentitled.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import PortalNav from '../ui/PortalNav'
import NavIcon from '../nav/NavIcon'
import AdminAccessGate from './AdminAccessGate'
import { adminBadgeLabel } from './useAdminAccess'
import { DASHBOARD_VIEW_ID, buildAdminApps } from './adminApps'
import { useIsMobile } from '../../hooks/useMediaQuery'
import '../AdminPanel.css'

export default function AdminAppShell({ app, access, renderView, dashboard }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)

  const { flags, entryState } = access

  // Entitled views for THIS operator — the same predicate the Control Room
  // tile used, so the rail can never offer a view the config would not.
  const entitledApp = useMemo(
    () => buildAdminApps(flags).find((a) => a.id === app.id) ?? null,
    [flags, app.id],
  )

  const requestedView = searchParams.get('view') ?? DASHBOARD_VIEW_ID
  const activeView =
    requestedView !== DASHBOARD_VIEW_ID && entitledApp?.views.some((v) => v.id === requestedView)
      ? requestedView
      : DASHBOARD_VIEW_ID

  const handleSelectView = useCallback(
    (id) => {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        if (id === DASHBOARD_VIEW_ID) next.delete('view')
        else next.set('view', id)
        return next
      })
      if (isMobile) setSidebarOpen(false)
    },
    [setSearchParams, isMobile],
  )

  // Escape closes the overlay rail, matching the global nav drawer.
  useEffect(() => {
    if (!sidebarOpen || !isMobile) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen, isMobile])

  // Unentitled operators never see the app's interior — but only once access
  // has actually resolved to 'granted'; the gate below renders the honest
  // denied/unverified screens for everything else.
  if (entryState === 'granted' && !entitledApp) {
    return <Navigate to="/admin" replace />
  }

  const railItems = entitledApp
    ? [
        { id: DASHBOARD_VIEW_ID, label: 'Dashboard', icon: 'grid' },
        ...entitledApp.views.map(({ id, label, icon }) => ({ id, label, icon })),
      ]
    : []

  return (
    <AdminAccessGate access={access}>
      <div className="admin-panel">
        <header className="admin-panel-header">
          <div className="admin-panel-header-content">
            <div className="admin-panel-title-section">
              <nav aria-label="Operations breadcrumb" className="admin-app-breadcrumb">
                <button
                  type="button"
                  className="admin-app-back"
                  onClick={() => navigate('/admin')}
                >
                  <NavIcon name="grid" size={16} />
                  <span>Control Room</span>
                </button>
              </nav>
              <h1>
                <span className="admin-app-title-icon" aria-hidden="true">
                  <NavIcon name={app.icon} size={22} />
                </span>
                {app.name}
              </h1>
              <span className="admin-badge">{adminBadgeLabel(flags)}</span>
            </div>
            <p className="admin-panel-subtitle">{app.blurb}</p>
          </div>
        </header>

        <div className={`portal-shell admin-portal-shell ${sidebarOpen ? '' : 'portal-collapsed'}`}>
          {isMobile && sidebarOpen && (
            <button
              type="button"
              className="portal-sidebar-backdrop"
              aria-label="Close sections menu"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside className="portal-sidebar admin-portal-sidebar">
            <div className="portal-sidebar-header">
              <button
                type="button"
                className="portal-sidebar-toggle"
                aria-expanded={sidebarOpen}
                aria-controls="admin-app-nav"
                aria-label={sidebarOpen ? 'Collapse sections menu' : 'Expand sections menu'}
                onClick={() => setSidebarOpen((o) => !o)}
              >
                <NavIcon name="menu" size={20} />
              </button>
              {sidebarOpen && <span className="portal-sidebar-title">Sections</span>}
            </div>

            <PortalNav
              id="admin-app-nav"
              items={railItems}
              activeId={activeView}
              onSelect={handleSelectView}
              ariaLabel={`${app.name} sections`}
              collapsed={!sidebarOpen}
            />
          </aside>

          <div className="portal-main">
            <main className="admin-panel-content">
              {activeView === DASHBOARD_VIEW_ID ? (
                <div className="admin-tab-content" role="tabpanel">
                  {dashboard}
                </div>
              ) : (
                renderView(activeView)
              )}
            </main>
          </div>
        </div>
      </div>
    </AdminAccessGate>
  )
}
