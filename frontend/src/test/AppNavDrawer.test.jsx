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

    expect(screen.getByRole('tab', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Trade' })).toBeInTheDocument()
    // Custody is surfaced as "Protect"; Security relocated into Tools.
    expect(screen.getByRole('tab', { name: 'Protect' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Security' })).toBeInTheDocument()

    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()

    // Removed Admin group / personal-account entries are absent from the menu.
    expect(screen.queryByRole('tab', { name: 'Preferences' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('routes Home to the dashboard', () => {
    renderDrawer('/wallet?tab=trade')
    fireEvent.click(screen.getByRole('tab', { name: /home/i }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/app')
  })

  it('routes a section item to its wallet tab (Protect → custody)', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('tab', { name: 'Protect' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=custody')
  })

  it('highlights the active section from the URL', () => {
    renderDrawer('/wallet?tab=security')
    expect(screen.getByRole('tab', { name: 'Security' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Trade' })).toHaveAttribute('aria-selected', 'false')
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
