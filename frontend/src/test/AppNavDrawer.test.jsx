import { useEffect } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'

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
    renderDrawer()

    // Drawer entries navigate between routes, so they use navigation (button)
    // semantics with aria-current — not tablist/tab.
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trade' })).toBeInTheDocument()
    // Custody is surfaced as "Protect"; the Backup & Security section is now "Recovery".
    expect(screen.getByRole('button', { name: 'Protect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeInTheDocument()
    // Not a tablist.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()

    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()

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
