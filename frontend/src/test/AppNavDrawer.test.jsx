import { useEffect } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'

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
// from the URL, and carries the in-app legal footer. Personal-account entries
// (Account/Membership/Preferences) intentionally live on the account button, not
// here.

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

  it('routes Portfolio to its wallet tab', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Portfolio' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=portfolio')
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

  it('contains the in-app legal footer', () => {
    const { container } = renderDrawer()
    const footer = container.querySelector('.app-footer--drawer')
    expect(footer).toBeTruthy()
    expect(
      within(footer).getByRole('link', { name: /Terms & Conditions/i })
    ).toHaveAttribute('href', '/terms')
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
