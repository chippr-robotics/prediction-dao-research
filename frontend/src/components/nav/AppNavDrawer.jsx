import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useNavDrawer } from '../../contexts/NavDrawerContext.js'
import { useIsMobile } from '../../hooks/useMediaQuery'
import PortalNav from '../ui/PortalNav'
import NavIcon from './NavIcon'
import Footer from '../Footer'
import {
  HOME_ITEM,
  PORTFOLIO_ITEM,
  WAGERS_VIEW,
  NAV_GROUPS,
  pathForNavItem,
  visibleNavGroups,
  isNavItemEnabledForTenant,
} from '../../config/appNav'
import { useChainTokens } from '../../hooks/useChainTokens'
import { collectiblesGatewayUrl } from '../../lib/collectibles/gatewayClient'
import { predictGatewayUrl } from '../../lib/predict/predictClient'
import { loadFavoriteApps, subscribeFavoriteApps } from '../../lib/miniapps/favorites'
import './AppNavDrawer.css'

// Deep-link alias parity with WalletPage (the Swap tab is now "Trade"; the
// old standalone Backup tab now lives inside the combined Security panel).
//
// Spec 073 (FR-009) — what this map deliberately does NOT contain yet. The Apps group
// collapsed to the single mini-app catalog entry, so ClearPath and Token Mint no longer
// appear in this menu; their `?tab=clearpath` / `?tab=tokens` deep links keep resolving to
// the host-native panels WalletPage still renders, unchanged. They become aliases to the
// mini-app routes — `tokens` → `/apps/token-mint` (T027) and `clearpath` → `/apps/clearpath`
// (T029) — only in the conversion tasks that actually publish those packages, and not
// before: an alias pointing at a mini-app nobody has registered turns a working deep link
// into a dead end, and the catalog would be claiming a verified package that does not exist.
// Wagers is NOT in this map and never will be — it did not become a package (see WAGERS_VIEW in
// config/appNav.js); it moved into Finance ▸ Transfer, and `/wagers` redirects there from App.jsx.
// This map must stay in parity with the copy in pages/WalletPage.jsx.
const TAB_ALIASES = { swap: 'trade', backup: 'security' }

/**
 * Tabs that have become mini-apps (spec 073 T027) — kept in parity with the same map in
 * `pages/WalletPage.jsx`, which performs the actual redirect. Here it only affects which nav item
 * reads as active, so a member arriving on `?tab=tokens` sees Apps highlighted rather than nothing.
 */
const TAB_TO_MINIAPP = { tokens: 'apps', clearpath: 'apps' }

// The drawer list = a top "Quick Access" group (Home, Portfolio, favorited mini-apps) + the
// section groups. Built per render because item visibility is chain-aware (spec 055: Collectibles
// hides entirely on networks OpenSea doesn't serve or with no gateway configured).
//
// Wagers used to be spliced into the Apps group here, because it was an absolute `/wagers` route
// rather than a `/wallet?tab=` section and so was not carried by NAV_GROUPS' tenant filter. That
// splice is gone: Wagers is now a view inside Finance ▸ Transfer (spec 073), reached through the
// Transfer entry NAV_GROUPS already carries, and gated by PayTransferPanel on the same `wagers`
// tenant feature. One fewer place for the menu and the routes to disagree.
function buildDrawerGroups(visibility, favoriteItems) {
  return [
    { label: 'Quick Access', items: [HOME_ITEM, PORTFOLIO_ITEM, ...favoriteItems] },
    ...visibleNavGroups(visibility, NAV_GROUPS),
  ]
}

// `favorites.js` entries -> drawer items. `showIcon` opts into PortalNav's initial-letter fallback
// (the on-chain registry carries no app icon, so the first letter of its name stands in for one,
// same as any other icon-less drawer entry would in the collapsed rail) so a favorited app is
// recognisable at a glance in the EXPANDED menu too, not just the icon-only gutter.
function favoriteToNavItem(favorite) {
  return { id: `favorite-${favorite.id}`, label: favorite.name, to: `/apps/${favorite.slug}`, showIcon: true }
}

// Which drawer entry reflects the current route, so the open menu highlights it.
function resolveActiveId(location, favoriteItems) {
  const { pathname, search } = location
  if (pathname === '/wallet') {
    const requested = new URLSearchParams(search).get('tab')
    if (TAB_TO_MINIAPP[requested]) return TAB_TO_MINIAPP[requested]
    return TAB_ALIASES[requested] || requested
  }
  if (pathname === '/app' || pathname === '/main' || pathname === '/fairwins') {
    return HOME_ITEM.id
  }
  // `/wagers` redirects to the Transfer section (App.jsx). Resolved here anyway so the menu
  // highlights Transfer for the render that happens BEFORE the redirect commits, rather than
  // flashing nothing selected.
  if (pathname === '/wagers') {
    return WAGERS_VIEW.tab
  }
  // A mounted mini-app (`/apps/<slug>`, spec 073) IS the Apps section — the workspace is
  // where a catalog launch lands. A favorited app highlights its OWN Quick Access shortcut
  // instead, so the member sees exactly which shortcut brought them here; everything else
  // falls back to the catalog entry, so nothing is left unselected for the entire time an app
  // is open. The trailing slash is part of the match so a future top-level route that merely
  // starts with those letters cannot borrow the highlight.
  if (pathname === '/apps' || pathname.startsWith('/apps/')) {
    const slug = pathname === '/apps' ? '' : pathname.slice('/apps/'.length)
    const favoriteMatch = favoriteItems.find((item) => item.to === `/apps/${slug}`)
    return favoriteMatch ? favoriteMatch.id : 'apps'
  }
  return null
}

/**
 * AppNavDrawer — the global left navigation ("us"). On mobile it's a slide-over
 * drawer opened by the clover logo, exactly as before. On larger screens it's
 * always visible as a persistent icon-only gutter (no page content renders
 * under it — see the `.app-shell` padding in this file's CSS) that expands in
 * place to the full labelled panel; it never fully hides on desktop, so a
 * section is always one click away. Selecting an entry routes to the section
 * and returns to the gutter; the in-app legal footer only fits once expanded.
 */
export default function AppNavDrawer() {
  const { isOpen, close, toggle } = useNavDrawer()
  const navigate = useNavigate()
  const location = useLocation()
  const { capabilities } = useChainTokens()
  const isMobile = useIsMobile()
  const drawerRef = useRef(null)

  // Favorited mini-apps (App Store quick-access). Gated on the `apps` tenant feature so a build
  // that has disabled the mini-app platform never surfaces a shortcut into it, even if a favorite
  // was saved on this device before the tenant config changed.
  const [favorites, setFavorites] = useState(() => loadFavoriteApps())
  useEffect(() => subscribeFavoriteApps(() => setFavorites(loadFavoriteApps())), [])
  const favoriteItems = useMemo(
    () => (isNavItemEnabledForTenant('apps') ? favorites.map(favoriteToNavItem) : []),
    [favorites],
  )

  const activeId = resolveActiveId(location, favoriteItems)
  const drawerGroups = useMemo(
    () =>
      buildDrawerGroups(
        {
          collectibles: Boolean(capabilities?.collectibles) && collectiblesGatewayUrl() !== '',
          predict: Boolean(capabilities?.predict) && predictGatewayUrl() !== '',
        },
        favoriteItems,
      ),
    [capabilities, favoriteItems],
  )

  // Desktop never fully closes: `collapsed` is the icon gutter, `isOpen` is the
  // expanded panel. Mobile keeps the original fully-hidden/fully-open pair.
  const collapsed = !isMobile && !isOpen

  // Close on Escape while open.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  // Desktop's expanded panel has no modal backdrop (the gutter beside it stays
  // usable), so a click outside it collapses back to the gutter instead.
  useEffect(() => {
    if (!isOpen || isMobile) return
    const onPointerDown = (event) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen, isMobile, close])

  const handleSelect = (id) => {
    const favorite = favoriteItems.find((item) => item.id === id)
    navigate(favorite ? favorite.to : pathForNavItem(id))
    close()
  }

  // Mobile: always fully closes. Desktop: flips between gutter and expanded.
  const handleToggleClick = () => {
    if (isMobile) close()
    else toggle()
  }

  return (
    <>
      {isOpen && isMobile && (
        <button
          type="button"
          className="app-nav-backdrop"
          aria-label="Close menu"
          onClick={close}
        />
      )}
      <aside
        ref={drawerRef}
        id="app-nav-drawer"
        className={`app-nav-drawer ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        aria-hidden={isMobile && !isOpen}
        aria-label="Site navigation"
      >
        <div className="app-nav-drawer-header">
          {!collapsed && <span className="app-nav-drawer-title">Menu</span>}
          <button
            type="button"
            className="app-nav-drawer-toggle"
            aria-label={collapsed ? 'Expand menu' : 'Close menu'}
            onClick={handleToggleClick}
          >
            {collapsed ? <NavIcon name="menu" /> : <span aria-hidden="true">✕</span>}
          </button>
        </div>

        <PortalNav
          variant="nav"
          groups={drawerGroups}
          activeId={activeId}
          onSelect={handleSelect}
          ariaLabel="Site sections"
          collapsed={collapsed}
        />

        {!collapsed && <Footer variant="drawer" />}
      </aside>
    </>
  )
}
