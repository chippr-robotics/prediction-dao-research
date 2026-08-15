import { useEffect } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { filterNavGroups, filterNavItems } from '../lib/nav/filterNav'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { addFavoriteApp, __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'
import {
  NAV_SECTIONS_PREF_KEY,
  __resetNavPreferencesForTests,
} from '../lib/nav/navPreferences'
import { getGlobalPreference } from '../utils/userStorage'

/*
 * Spec 081 US3 — the sticky menu filter.
 *
 * A filter is a statement about the RESULT SET, so it outranks a fold: a match hidden inside a
 * collapsed section would make the drawer report fewer hits than it found. It is also never
 * persisted, and clearing it must leave the member's own folds exactly as they were.
 */

function OpenOnMount() {
  const { open } = useNavDrawer()
  useEffect(() => { open() }, [open])
  return null
}

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

const field = () => screen.getByLabelText('Filter menu')
const type = (value) => fireEvent.change(field(), { target: { value } })
const headings = () =>
  Array.from(document.querySelectorAll('.portal-nav-group-label')).map((el) => el.textContent.trim())
const rows = () =>
  Array.from(document.querySelectorAll('.portal-nav-item-label')).map((el) => el.textContent)

const GROUPS = [
  { label: 'Finance', items: [{ id: 'earn', label: 'Earn' }, { id: 'trade', label: 'Trade' }] },
  { label: 'Tools', items: [{ id: 'security', label: 'Recovery' }] },
]

describe('filterNavGroups / filterNavItems (spec 081 FR-014)', () => {
  it('returns the groups untouched for an empty or whitespace query', () => {
    expect(filterNavGroups(GROUPS, '')).toBe(GROUPS)
    expect(filterNavGroups(GROUPS, '   ')).toBe(GROUPS)
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(filterNavGroups(GROUPS, '  TRA  ')).toEqual([
      { label: 'Finance', items: [{ id: 'trade', label: 'Trade' }] },
    ])
  })

  it('matches anywhere in the label, not just the start', () => {
    expect(filterNavGroups(GROUPS, 'cover')).toEqual([
      { label: 'Tools', items: [{ id: 'security', label: 'Recovery' }] },
    ])
  })

  it('drops a group left with no matches, heading and all', () => {
    expect(filterNavGroups(GROUPS, 'earn').map((g) => g.label)).toEqual(['Finance'])
    expect(filterNavGroups(GROUPS, 'zzz')).toEqual([])
  })

  it('applies the same rule to a flat item list', () => {
    const items = [{ id: 'a', label: 'Token Mint' }, { id: 'b', label: 'ClearPath' }]
    expect(filterNavItems(items, 'mint')).toEqual([items[0]])
    expect(filterNavItems(items, '')).toBe(items)
  })
})

describe('AppNavDrawer — menu filter (spec 081 US3)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('narrows the menu to matching items under the headings that own them', () => {
    renderDrawer()
    type('tra')

    // Settings joins Trade and Transfer because the filter now spans the nav search index, and
    // "tra" is a prefix of "tracking" — a synonym the Privacy card answers to. That is the
    // feature working, not a stray hit: the row carries a Privacy shortcut with it (see
    // navSearchIndex.test.jsx). It is also why the off-menu heading appears alongside Finance.
    expect(rows()).toEqual(['Trade', 'Transfer', 'Settings'])
    expect(headings()).toEqual(['Finance', 'Settings & Account'])
  })

  it('shows a match that lives inside a section the member folded', () => {
    renderDrawer()
    // Tools is folded by default, so Recovery is not rendered...
    expect(screen.queryByRole('button', { name: 'Recovery' })).not.toBeInTheDocument()

    type('recov')
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeInTheDocument()
    expect(headings()).toEqual(['Tools'])
  })

  it('restores the folds untouched when the filter is cleared', () => {
    renderDrawer()
    // Give the member a fold of their own to lose.
    fireEvent.click(screen.getByRole('button', { name: /^Finance section$/i }))
    expect(screen.queryByRole('button', { name: 'Trade' })).not.toBeInTheDocument()

    type('recov')
    fireEvent.click(screen.getByRole('button', { name: 'Clear menu filter' }))

    expect(screen.queryByRole('button', { name: 'Trade' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Protect' })).not.toBeInTheDocument()
    // The overrides never wrote anything: only the member's own fold is stored.
    expect(getGlobalPreference(NAV_SECTIONS_PREF_KEY)).toEqual({ finance: false })
  })

  it('searches pinned apps as well as section items', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 13, slug: 'clearpath', name: 'ClearPath' })
    renderDrawer()

    type('token')
    const strip = document.querySelector('.pinned-apps-strip')
    expect(within(strip).getByRole('button', { name: 'Token Mint' })).toBeInTheDocument()
    expect(within(strip).queryByRole('button', { name: 'ClearPath' })).not.toBeInTheDocument()
  })

  it('hides the strip entirely when no pinned app matches', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })
    renderDrawer()

    type('trade')
    expect(document.querySelector('.pinned-apps-strip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Trade' })).toBeInTheDocument()
  })

  it('says so out loud when nothing matches, rather than showing an empty panel', () => {
    renderDrawer()
    type('zzzzz')

    expect(rows()).toEqual([])
    expect(screen.getByRole('status')).toHaveTextContent('No menu entries match')
    expect(screen.getByRole('status')).toHaveTextContent('zzzzz')
  })

  it('navigates from a result, closes the drawer, and does not carry the filter back', () => {
    renderDrawer()
    type('recov')
    fireEvent.click(screen.getByRole('button', { name: 'Recovery' }))

    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=security')
    // Selecting closes the drawer (to the desktop gutter here), so the field is gone with it.
    expect(document.getElementById('app-nav-drawer').className).toContain('collapsed')
    expect(screen.queryByLabelText('Filter menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand menu' }))
    expect(field()).toHaveValue('')
    // And the whole menu is back, not just what "recov" matched.
    expect(rows()).toContain('Portfolio')
  })

  it('offers the clear control only while the field has content', () => {
    renderDrawer()
    expect(screen.queryByRole('button', { name: 'Clear menu filter' })).not.toBeInTheDocument()
    type('tra')
    expect(screen.getByRole('button', { name: 'Clear menu filter' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear menu filter' }))
    expect(field()).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear menu filter' })).not.toBeInTheDocument()
  })

  it('starts empty on each open — a filter is not a saved view', () => {
    renderDrawer()
    type('tra')

    // Close and re-open through the drawer's own controls.
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand menu' }))

    expect(field()).toHaveValue('')
    expect(rows()).toContain('Portfolio')
  })

  it('does not render the field in the collapsed desktop gutter', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )
    expect(document.getElementById('app-nav-drawer').className).toContain('collapsed')
    expect(screen.queryByLabelText('Filter menu')).not.toBeInTheDocument()
  })
})
