import { useEffect } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import NavigationPreferencesPanel from '../components/account/NavigationPreferencesPanel'
import PortalNav from '../components/ui/PortalNav'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'
import {
  NAV_DENSITY_PREF_KEY,
  loadNavDensity,
  setNavDensity,
  __resetNavPreferencesForTests,
} from '../lib/nav/navPreferences'
import { getGlobalPreference } from '../utils/userStorage'

/*
 * Spec 081 US4 — Compact density.
 *
 * Two things have to hold and neither is a matter of taste: the drawer must pick the change up
 * without a reload (the store notifies, the drawer re-reads), and Compact must not shrink any
 * interactive target below 36x36 CSS px — comfortably above WCAG 2.2 AA Target Size (Minimum)
 * (24x24). jsdom computes no layout, so the floor is asserted against the stylesheet's declared
 * box instead, which is where a regression would actually be written.
 */

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

const drawer = () => document.getElementById('app-nav-drawer')

const drawerCss = readFileSync(resolve(process.cwd(), 'src/components/nav/AppNavDrawer.css'), 'utf-8')
const portalCss = readFileSync(resolve(process.cwd(), 'src/components/ui/PortalNav.css'), 'utf-8')

/** The declaration block for one selector, as written in the file. */
function ruleFor(css, selector) {
  const index = css.indexOf(`${selector} {`)
  expect(index, `expected a rule for \`${selector}\``).toBeGreaterThan(-1)
  return css.slice(index, css.indexOf('}', index))
}

function px(block, property) {
  const match = new RegExp(`(?:^|[;{\\s])${property}:\\s*([\\d.]+)px`, 'm').exec(block)
  return match ? Number(match[1]) : null
}

/** `padding: 5px 10px` -> 5 (the vertical component). */
function verticalPadding(block) {
  const match = /(?:^|[;{\s])padding:\s*([\d.]+)px/m.exec(block)
  return match ? Number(match[1]) : null
}

describe('AppNavDrawer — compact density (spec 081 US4)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('renders comfortable by default', () => {
    renderDrawer()
    expect(loadNavDensity()).toBe('comfortable')
    expect(drawer().className).not.toContain('app-nav-drawer--compact')
  })

  it('applies the compact modifier as soon as the preference changes, with no reload', () => {
    renderDrawer()
    render(<NavigationPreferencesPanel />)

    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }))

    // The already-mounted drawer picked it up — it subscribes to the store rather than reading
    // once at mount.
    expect(drawer().className).toContain('app-nav-drawer--compact')
    expect(getGlobalPreference(NAV_DENSITY_PREF_KEY)).toBe('compact')
  })

  it('keeps the choice on the next visit', () => {
    setNavDensity('compact')
    __resetNavPreferencesForTests()
    renderDrawer()
    expect(drawer().className).toContain('app-nav-drawer--compact')
  })

  it('switches back to comfortable', () => {
    setNavDensity('compact')
    renderDrawer()
    render(<NavigationPreferencesPanel />)

    fireEvent.click(screen.getByRole('radio', { name: 'Comfortable' }))
    expect(drawer().className).not.toContain('app-nav-drawer--compact')
  })

  it('offers exactly the two densities, with the current one checked', () => {
    render(<NavigationPreferencesPanel />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.value)).toEqual(['comfortable', 'compact'])
    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked()
  })

  it('never scopes a compact rule outside the drawer (the Admin / My Account rails share PortalNav)', () => {
    expect(portalCss).not.toContain('app-nav-drawer--compact')
    for (const line of drawerCss.split('\n')) {
      if (line.includes('app-nav-drawer--compact')) {
        expect(line.trimStart().startsWith('.app-nav-drawer--compact')).toBe(true)
      }
    }
  })

  it('leaves a PortalNav rendered outside the drawer untouched by the preference', () => {
    setNavDensity('compact')
    const { container } = render(
      <PortalNav
        variant="tabs"
        items={[{ id: 'a', label: 'Alpha' }]}
        activeId="a"
        onSelect={() => {}}
        ariaLabel="Admin sections"
      />
    )
    expect(container.querySelector('.app-nav-drawer--compact')).toBeNull()
    expect(container.querySelector('.portal-nav').className).toBe('portal-nav ')
  })

  describe('touch targets in compact', () => {
    it('keeps a nav row at 36px: icon tile plus its vertical padding', () => {
      const row = ruleFor(drawerCss, '.app-nav-drawer--compact .portal-nav-item')
      const icon = ruleFor(drawerCss, '.app-nav-drawer--compact .portal-nav-item-icon')
      const height = px(icon, 'height') + 2 * verticalPadding(row)
      expect(height).toBeGreaterThanOrEqual(36)
    })

    it('keeps a pinned tile at 36px', () => {
      const tile = ruleFor(drawerCss, '.app-nav-drawer--compact .pinned-app-tile')
      const icon = ruleFor(drawerCss, '.app-nav-drawer--compact .pinned-app-tile-icon')
      const height = px(icon, 'height') + 2 * verticalPadding(tile)
      expect(height).toBeGreaterThanOrEqual(36)
    })

    it('keeps the section header, the filter field, and the overflow control at 36px', () => {
      const toggle = ruleFor(drawerCss, '.app-nav-drawer--compact .portal-nav-group-toggle')
      expect(px(toggle, 'min-height')).toBeGreaterThanOrEqual(36)

      const input = ruleFor(drawerCss, '.app-nav-drawer--compact .app-nav-search-input')
      expect(px(input, 'min-height')).toBeGreaterThanOrEqual(36)

      // The overflow control is not re-declared in compact, so it keeps its base floor.
      const more = ruleFor(drawerCss, '.pinned-app-more')
      expect(px(more, 'min-height')).toBeGreaterThanOrEqual(36)
      expect(drawerCss).not.toContain('.app-nav-drawer--compact .pinned-app-more')
    })

    it('is meaningfully denser than comfortable (SC-004: at least 30% more rows)', () => {
      const comfortableRow = ruleFor(drawerCss, '.app-nav-drawer .portal-nav-item')
      const compactRow = ruleFor(drawerCss, '.app-nav-drawer--compact .portal-nav-item')
      const baseIcon = ruleFor(portalCss, '.portal-nav-item-icon')
      const compactIcon = ruleFor(drawerCss, '.app-nav-drawer--compact .portal-nav-item-icon')

      const comfortableHeight = px(baseIcon, 'height') + 2 * verticalPadding(comfortableRow)
      const compactHeight = px(compactIcon, 'height') + 2 * verticalPadding(compactRow)
      // rows-per-screen scales as 1/height.
      expect(comfortableHeight / compactHeight).toBeGreaterThanOrEqual(1.3)
    })
  })
})
