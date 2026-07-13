import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useNavDrawer } from '../../contexts/NavDrawerContext.js'
import PortalNav from '../ui/PortalNav'
import Footer from '../Footer'
import { HOME_ITEM, WAGERS_ITEM, NAV_GROUPS, pathForNavItem } from '../../config/appNav'
import './AppNavDrawer.css'

// Deep-link alias parity with WalletPage (the Swap tab is now "Trade"; the
// old standalone Backup tab now lives inside the combined Security panel).
const TAB_ALIASES = { swap: 'trade', backup: 'security' }

// The drawer list = a top "Quick Access" group (Home) + the section groups,
// with Wagers moved down into the Apps group (it keeps its absolute /wagers route).
const DRAWER_GROUPS = [
  { label: 'Quick Access', items: [HOME_ITEM] },
  ...NAV_GROUPS.map((group) =>
    group.label === 'Apps'
      ? { ...group, items: [WAGERS_ITEM, ...group.items] }
      : group,
  ),
]

// Which drawer entry reflects the current route, so the open menu highlights it.
function resolveActiveId(location) {
  const { pathname, search } = location
  if (pathname === '/wallet') {
    const requested = new URLSearchParams(search).get('tab')
    return TAB_ALIASES[requested] || requested
  }
  if (pathname === '/app' || pathname === '/main' || pathname === '/fairwins') {
    return HOME_ITEM.id
  }
  if (pathname === '/wagers') {
    return WAGERS_ITEM.id
  }
  return null
}

/**
 * AppNavDrawer — the global left navigation drawer ("us"), opened by the clover
 * logo on every in-app route. Replaces the per-page section rail that used to
 * live only on My Account. Selecting an entry routes to the section and closes
 * the drawer; the in-app legal footer is pinned to the bottom.
 */
export default function AppNavDrawer() {
  const { isOpen, close } = useNavDrawer()
  const navigate = useNavigate()
  const location = useLocation()
  const activeId = resolveActiveId(location)

  // Close on Escape while open.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  const handleSelect = (id) => {
    navigate(pathForNavItem(id))
    close()
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="app-nav-backdrop"
          aria-label="Close menu"
          onClick={close}
        />
      )}
      <aside
        id="app-nav-drawer"
        className={`app-nav-drawer ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
        aria-label="Site navigation"
      >
        <div className="app-nav-drawer-header">
          <span className="app-nav-drawer-title">Menu</span>
          <button
            type="button"
            className="app-nav-drawer-close"
            aria-label="Close menu"
            onClick={close}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <PortalNav
          variant="nav"
          groups={DRAWER_GROUPS}
          activeId={activeId}
          onSelect={handleSelect}
          ariaLabel="Site sections"
        />

        <Footer variant="drawer" />
      </aside>
    </>
  )
}
