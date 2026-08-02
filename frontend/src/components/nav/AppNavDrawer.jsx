import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useNavDrawer } from '../../contexts/NavDrawerContext.js'
import { useIsMobile } from '../../hooks/useMediaQuery'
import PortalNav from '../ui/PortalNav'
import NavIcon from './NavIcon'
import Footer from '../Footer'
import {
  HOME_ITEM,
  PORTFOLIO_ITEM,
  WAGERS_ITEM,
  NAV_GROUPS,
  isNavItemEnabledForTenant,
  pathForNavItem,
  visibleNavGroups,
} from '../../config/appNav'
import { useChainTokens } from '../../hooks/useChainTokens'
import { collectiblesGatewayUrl } from '../../lib/collectibles/gatewayClient'
import { predictGatewayUrl } from '../../lib/predict/predictClient'
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
// `/wagers` is untouched for the same reason (its conversion is T033, explicitly last — R11).
// This map must stay in parity with the copy in pages/WalletPage.jsx.
const TAB_ALIASES = { swap: 'trade', backup: 'security' }

// The label of the group Wagers is spliced into, below.
const APPS_GROUP_LABEL = 'Apps'

// The drawer list = a top "Quick Access" group (Home, Portfolio) + the section
// groups, with Wagers moved down into the Apps group (it keeps its absolute
// /wagers route). Built per render because item visibility is chain-aware
// (spec 055: Collectibles hides entirely on networks OpenSea doesn't serve or
// with no gateway configured).
//
// Wagers is spliced in here rather than declared in NAV_GROUPS because it is not a
// `/wallet?tab=` section — which also means it is not carried by that model's tenant
// filter. Since spec 073 the Apps group holds exactly one item gated on the `miniapps`
// feature, so on a tenant without mini-apps the group disappears from NAV_GROUPS entirely.
// Re-adding the group for Wagers when that happens is what stops a mini-app feature flag
// from silently deciding whether Wagers is reachable from the menu: a tenant with wagers and
// no mini-apps still gets its Wagers entry, and a tenant with neither gets no Apps group.
function buildDrawerGroups(visibility) {
  const sections = visibleNavGroups(visibility, NAV_GROUPS)
  const wagers = isNavItemEnabledForTenant(WAGERS_ITEM.id) ? [WAGERS_ITEM] : []
  const withWagers = sections.map((group) =>
    group.label === APPS_GROUP_LABEL
      ? { ...group, items: [...wagers, ...group.items] }
      : group,
  )
  const hasAppsGroup = withWagers.some((group) => group.label === APPS_GROUP_LABEL)
  return [
    { label: 'Quick Access', items: [HOME_ITEM, PORTFOLIO_ITEM] },
    ...withWagers,
    ...(!hasAppsGroup && wagers.length > 0
      ? [{ label: APPS_GROUP_LABEL, items: wagers }]
      : []),
  ]
}

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
  // A mounted mini-app (`/apps/<slug>`, spec 073) IS the Apps section — the workspace is
  // where a catalog launch lands. Highlighting the catalog entry keeps the menu pointing at
  // where the member actually is, instead of showing nothing selected for the entire time an
  // app is open. The trailing slash is part of the match so a future top-level route that
  // merely starts with those letters cannot borrow the highlight.
  if (pathname === '/apps' || pathname.startsWith('/apps/')) {
    return 'apps'
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
  const activeId = resolveActiveId(location)
  const { capabilities } = useChainTokens()
  const isMobile = useIsMobile()
  const drawerRef = useRef(null)
  const drawerGroups = useMemo(
    () =>
      buildDrawerGroups({
        collectibles: Boolean(capabilities?.collectibles) && collectiblesGatewayUrl() !== '',
        predict: Boolean(capabilities?.predict) && predictGatewayUrl() !== '',
      }),
    [capabilities],
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
    navigate(pathForNavItem(id))
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
