import { useEffect } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'
import {
  NAV_SECTIONS_PREF_KEY,
  __resetNavPreferencesForTests,
} from '../lib/nav/navPreferences'
import { getGlobalPreference } from '../utils/userStorage'

/*
 * Spec 081 US1 — collapsible sections.
 *
 * The drawer's height used to be whatever the sum of its items happened to be. Sections now
 * fold, Tools and Apps start folded, and the fold is remembered per device. The two overrides
 * (the section owning the current page, and an active filter) DISPLAY a section as open without
 * ever writing that back — a member who folded Tools while sitting on Recovery still finds it
 * folded when they leave.
 */

function OpenOnMount() {
  const { open } = useNavDrawer()
  useEffect(() => { open() }, [open])
  return null
}

function renderDrawer(route = '/app') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <NavDrawerProvider>
        <OpenOnMount />
        <AppNavDrawer />
      </NavDrawerProvider>
    </MemoryRouter>
  )
}

const header = (name) => screen.getByRole('button', { name: new RegExp(`^${name} section$`, 'i') })

describe('AppNavDrawer — collapsible sections (spec 081 US1)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('opens Quick Access and Finance by default and folds Tools', () => {
    renderDrawer()

    // Finance is open: its items are rendered.
    expect(screen.getByRole('button', { name: 'Trade' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeInTheDocument()
    // Quick Access is open.
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeInTheDocument()

    // Tools is folded: its items are UNMOUNTED, not merely hidden (research R2), so they are out
    // of the accessibility tree and the tab order too.
    expect(screen.queryByRole('button', { name: 'Protect' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Address Book' })).not.toBeInTheDocument()
    // The mini-app catalog is hoisted into Quick Access (spec 093 — the door to the whole
    // platform must not be buried in a folded section), so it does NOT fold with Tools.
    expect(screen.getByRole('button', { name: 'Apps' })).toBeInTheDocument()

    expect(header('Finance')).toHaveAttribute('aria-expanded', 'true')
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'false')
    // And "Apps" is no longer a section at all.
    expect(screen.queryByRole('button', { name: /^Apps section$/i })).not.toBeInTheDocument()
  })

  it('toggles a section open and closed from its header', () => {
    renderDrawer()

    fireEvent.click(header('Tools'))
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Protect' })).toBeInTheDocument()

    fireEvent.click(header('Tools'))
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Protect' })).not.toBeInTheDocument()
  })

  it('marks the header expanded state with a chevron that reflects it', () => {
    renderDrawer()
    expect(header('Tools').className).not.toContain('expanded')
    expect(header('Tools').querySelector('.portal-nav-group-chevron')).toBeTruthy()

    fireEvent.click(header('Tools'))
    expect(header('Tools').className).toContain('expanded')
  })

  it('names the region each header controls', () => {
    renderDrawer()
    fireEvent.click(header('Tools'))

    const panelId = header('Tools').getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = document.getElementById(panelId)
    expect(panel).toBeTruthy()
    expect(panel).toHaveAttribute('role', 'group')
    expect(panel).toHaveAttribute('aria-label', 'Tools')
    expect(panel).toContainElement(screen.getByRole('button', { name: 'Protect' }))
  })

  it('remembers a fold across a remount', () => {
    const first = renderDrawer()
    fireEvent.click(header('Tools'))
    expect(getGlobalPreference(NAV_SECTIONS_PREF_KEY)).toEqual({ tools: true })
    first.unmount()

    renderDrawer()
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Protect' })).toBeInTheDocument()
  })

  it('remembers a section the member folded that was open by default', () => {
    const first = renderDrawer()
    fireEvent.click(header('Finance'))
    first.unmount()

    renderDrawer()
    expect(header('Finance')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Trade' })).not.toBeInTheDocument()
  })

  it('force-expands the section holding the current page even when it is folded', () => {
    // Recovery lives in Tools, which is folded by default. The item marked as the current page
    // must never be invisible.
    renderDrawer('/wallet?tab=security')
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Recovery' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not persist the force-expand, so the fold survives leaving the section', () => {
    const onTools = renderDrawer('/wallet?tab=security')
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'true')
    // Nothing was written: the override is a render-time display decision.
    expect(getGlobalPreference(NAV_SECTIONS_PREF_KEY, null)).toBeNull()
    onTools.unmount()

    renderDrawer('/wallet?tab=trade')
    expect(header('Tools')).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps every section reachable in the collapsed desktop gutter, folds notwithstanding', () => {
    // The 64px rail has no room for a heading control, and folding it would strand sections
    // behind a control that does not exist there.
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )

    const aside = document.getElementById('app-nav-drawer')
    expect(aside.className).toContain('collapsed')
    // Tools items are present despite Tools defaulting to folded.
    expect(screen.getByRole('button', { name: 'Protect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeInTheDocument()
    // And no heading became a control.
    expect(screen.queryByRole('button', { name: /^Tools section$/i })).not.toBeInTheDocument()
  })
})
