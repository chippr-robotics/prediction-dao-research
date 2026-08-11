import { useEffect } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import NavigationPreferencesPanel from '../components/account/NavigationPreferencesPanel'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { addFavoriteApp, __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'
import { setNavDensity, __resetNavPreferencesForTests } from '../lib/nav/navPreferences'

// Spec 081 SC-005 — the drawer stays clean in both densities, with sections folded and
// unfolded, with a pinned strip present, and with a filter active.

function OpenOnMount() {
  const { open } = useNavDrawer()
  useEffect(() => { open() }, [open])
  return null
}

function renderDrawer() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <NavDrawerProvider>
        <OpenOnMount />
        <AppNavDrawer />
      </NavDrawerProvider>
    </MemoryRouter>
  )
}

function pin(n) {
  for (let i = 1; i <= n; i += 1) addFavoriteApp({ id: i, slug: `app-${i}`, name: `App ${i}` })
}

describe('AppNavDrawer accessibility (spec 081 SC-005)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('has no violations in the default state', async () => {
    const { container } = renderDrawer()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with every section expanded', async () => {
    const { container } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: /^Tools section$/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with a pinned strip, both capped and expanded', async () => {
    pin(8)
    const { container } = renderDrawer()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 (+3)' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations while a filter is active', async () => {
    pin(2)
    const { container } = renderDrawer()
    fireEvent.change(screen.getByLabelText('Filter menu'), { target: { value: 'tra' } })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations when a filter matches nothing', async () => {
    const { container } = renderDrawer()
    fireEvent.change(screen.getByLabelText('Filter menu'), { target: { value: 'zzzzz' } })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in compact density', async () => {
    setNavDensity('compact')
    pin(6)
    const { container } = renderDrawer()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations on the density preference panel', async () => {
    const { container } = render(<NavigationPreferencesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
