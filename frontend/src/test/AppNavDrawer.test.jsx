import { useEffect } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { addFavoriteApp, __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'

// useIsMobile() reads window.matchMedia('(max-width: 768px)'). setup.js mocks
// matches: false for every query, i.e. desktop — which these tests rely on
// unless a block below opts into the mobile matcher instead.
function mockViewport({ mobile }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: mobile && /max-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// The drawer is aria-hidden while closed (off-screen), so open it on mount to
// exercise its contents — mirrors the clover-logo trigger.
function OpenOnMount() {
  const { open } = useNavDrawer()
  useEffect(() => { open() }, [open])
  return null
}

// App navigation redesign — the global left drawer ("us"). It lists Home plus
// the Finance/Tools/Apps sections, routes each entry, highlights the active one
// from the URL, and carries a copyright-only footer. Personal-account entries
// (Account/Membership/Preferences) intentionally live on the account button, not
// here. The legal/policy links that used to live in this footer moved to
// Settings → App (issue #1025).

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{location.pathname}{location.search}</div>
}

function renderDrawer(route = '/app') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <NavDrawerProvider>
        <OpenOnMount />
        <AppNavDrawer />
        <LocationProbe />
      </NavDrawerProvider>
    </MemoryRouter>
  )
}

describe('AppNavDrawer (global nav drawer)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
  })

  it('lists Home plus the Finance / Tools / Apps sections', () => {
    const { container } = renderDrawer()

    // Drawer entries navigate between routes, so they use navigation (button)
    // semantics with aria-current — not tablist/tab.
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trade' })).toBeInTheDocument()
    // Custody is surfaced as "Protect"; the Backup & Security section is now "Recovery".
    expect(screen.getByRole('button', { name: 'Protect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeInTheDocument()
    // Not a tablist.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()

    // Group headings are matched as headings rather than by bare text: since spec 073 the Apps
    // group holds a single entry that is also labelled "Apps" (the mini-app catalog), so the
    // string appears twice in the drawer and a text lookup is ambiguous.
    const groupLabels = Array.from(container.querySelectorAll('.portal-nav-group-label')).map(
      (el) => el.textContent
    )
    expect(groupLabels).toEqual(expect.arrayContaining(['Finance', 'Tools', 'Apps']))

    // Removed Admin group / personal-account entries are absent from the menu.
    expect(screen.queryByRole('button', { name: 'Preferences' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('lists Portfolio under Quick Access with Home, not under Finance', () => {
    const { container } = renderDrawer()

    expect(screen.getByRole('button', { name: 'Portfolio' })).toBeInTheDocument()

    // Portfolio sits between the Quick Access and Finance group labels, i.e.
    // it belongs to Quick Access rather than Finance's item list.
    const labels = Array.from(
      container.querySelectorAll('.portal-nav-group-label, .portal-nav-item-label')
    ).map((el) => el.textContent)
    const quickAccessIdx = labels.indexOf('Quick Access')
    const financeIdx = labels.indexOf('Finance')
    const portfolioIdx = labels.indexOf('Portfolio')
    expect(portfolioIdx).toBeGreaterThan(quickAccessIdx)
    expect(portfolioIdx).toBeLessThan(financeIdx)
  })

  it('routes Portfolio to the unified My Account view (spec 074)', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Portfolio' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=account&view=portfolio')
  })

  it('routes Home to the dashboard', () => {
    renderDrawer('/wallet?tab=trade')
    fireEvent.click(screen.getByRole('button', { name: /home/i }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/app')
  })

  it('routes a section item to its wallet tab (Protect → custody)', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Protect' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=custody')
  })

  it('highlights the active section from the URL with aria-current', () => {
    renderDrawer('/wallet?tab=security')
    expect(screen.getByRole('button', { name: 'Recovery' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Trade' })).not.toHaveAttribute('aria-current')
  })

  it('contains a copyright-only footer, with no legal/policy links (issue #1025)', () => {
    const { container } = renderDrawer()
    const footer = container.querySelector('.app-footer--drawer')
    expect(footer).toBeTruthy()
    expect(within(footer).getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: /Terms & Conditions/i })).not.toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: /Risk Disclosure/i })).not.toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: /Privacy Policy/i })).not.toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: /Account Moderation/i })).not.toBeInTheDocument()
  })
})

// Larger screens: the drawer is a persistent icon gutter that expands in
// place rather than sliding fully off-canvas — see AppNavDrawer.jsx.
describe('AppNavDrawer (desktop icon gutter)', () => {
  afterEach(() => {
    // Restore the desktop-by-default matcher the rest of this file relies on.
    mockViewport({ mobile: false })
  })

  it('shows a collapsed icon gutter by default, not hidden off-canvas', () => {
    mockViewport({ mobile: false })
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )

    const aside = document.getElementById('app-nav-drawer')
    expect(aside).not.toHaveAttribute('aria-hidden', 'true')
    expect(aside.className).toContain('collapsed')
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeInTheDocument()
    // Entries stay reachable (label visually hidden, not removed) — the
    // accessible name still resolves them.
    expect(screen.getByRole('button', { name: 'Trade' })).toBeInTheDocument()
  })

  it('expands to the full labelled panel once opened', () => {
    mockViewport({ mobile: false })
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <OpenOnMount />
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )

    const aside = document.getElementById('app-nav-drawer')
    expect(aside.className).not.toContain('collapsed')
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument()
  })

  it('stays fully hidden off-canvas on mobile until opened', () => {
    mockViewport({ mobile: true })
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )

    const aside = document.getElementById('app-nav-drawer')
    expect(aside).toHaveAttribute('aria-hidden', 'true')
    expect(aside.className).not.toContain('collapsed')
  })
})

// Favorited mini-apps (App Store Quick Access). A favorite is a device-scoped shortcut
// (lib/miniapps/favorites.js) into `/apps/<slug>`, surfaced alongside Home/Portfolio.
describe('AppNavDrawer (favorited mini-apps / Quick Access)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
  })

  it('lists a favorited app under Quick Access and routes it to its workspace', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })

    const { container } = renderDrawer()

    expect(screen.getByRole('button', { name: 'Token Mint' })).toBeInTheDocument()
    const labels = Array.from(
      container.querySelectorAll('.portal-nav-group-label, .portal-nav-item-label')
    ).map((el) => el.textContent)
    const quickAccessIdx = labels.indexOf('Quick Access')
    const financeIdx = labels.indexOf('Finance')
    const favoriteIdx = labels.indexOf('Token Mint')
    expect(favoriteIdx).toBeGreaterThan(quickAccessIdx)
    expect(favoriteIdx).toBeLessThan(financeIdx)

    fireEvent.click(screen.getByRole('button', { name: 'Token Mint' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/apps/token-mint')
  })

  it('lists only Home and Portfolio under Quick Access when nothing is favorited', () => {
    const { container } = renderDrawer()
    const labels = Array.from(
      container.querySelectorAll('.portal-nav-group-label, .portal-nav-item-label')
    ).map((el) => el.textContent)
    const quickAccessIdx = labels.indexOf('Quick Access')
    const financeIdx = labels.indexOf('Finance')
    expect(labels.slice(quickAccessIdx + 1, financeIdx)).toEqual(['Home', 'Portfolio'])
  })

  it('highlights the favorited shortcut itself, not just the Apps entry, when it is the open app', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })
    renderDrawer('/apps/token-mint')
    expect(screen.getByRole('button', { name: 'Token Mint' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Apps' })).not.toHaveAttribute('aria-current')
  })
})
