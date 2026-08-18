import { useEffect } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppNavDrawer from '../components/nav/AppNavDrawer'
import { VISIBLE_PINNED_CAP } from '../components/nav/PinnedAppsStrip'
import { NavDrawerProvider } from '../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../contexts/NavDrawerContext.js'
import { addFavoriteApp, __resetFavoriteAppsForTests } from '../lib/miniapps/favorites'
import { __resetNavPreferencesForTests } from '../lib/nav/navPreferences'

/*
 * Spec 081 US2 — pinned mini-apps as one capped horizontal strip.
 *
 * The reported problem: pins are unbounded and each one used to add a full-width row to Quick
 * Access, so the section the member controls was the section pushing Finance / Tools / Apps off
 * a phone screen. The strip bounds that region at ONE row's height whatever the pin count; the
 * cap plus a `+N more` control makes the overflow both reachable and disclosed.
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

function pin(n) {
  for (let i = 1; i <= n; i += 1) {
    addFavoriteApp({ id: i, slug: `app-${i}`, name: `App ${i}` })
  }
}

const strip = () => document.querySelector('.pinned-apps-strip')
const tiles = () => Array.from(document.querySelectorAll('.pinned-app-tile'))

describe('AppNavDrawer — pinned apps strip (spec 081 US2)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('renders each pinned app as a tile in one strip', () => {
    pin(3)
    renderDrawer()

    expect(strip()).toBeTruthy()
    expect(strip()).toHaveAttribute('aria-label', 'Pinned apps')
    expect(tiles()).toHaveLength(3)
    expect(within(strip()).getByRole('button', { name: 'App 1' })).toBeInTheDocument()
    expect(within(strip()).getByRole('button', { name: 'App 3' })).toBeInTheDocument()
  })

  it('renders nothing at all when no apps are pinned', () => {
    renderDrawer()
    expect(strip()).toBeNull()
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument()
  })

  it('caps the visible tiles and discloses how many are hidden', () => {
    pin(8)
    renderDrawer()

    expect(VISIBLE_PINNED_CAP).toBe(5)
    expect(tiles()).toHaveLength(VISIBLE_PINNED_CAP)
    // The control names the true total AND the hidden count: it is the honest disclosure that
    // pins are out of view, not merely the way to reach them.
    const more = screen.getByRole('button', { name: 'Show all 8 (+3)' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'App 8' })).not.toBeInTheDocument()
  })

  it('reveals the rest in place and folds back again', () => {
    pin(8)
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 (+3)' }))
    expect(tiles()).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'App 8' })).toBeInTheDocument()
    const fewer = screen.getByRole('button', { name: 'Show fewer' })
    expect(fewer).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(fewer)
    expect(tiles()).toHaveLength(VISIBLE_PINNED_CAP)
  })

  it('shows no overflow control when the pin count is exactly the cap', () => {
    pin(VISIBLE_PINNED_CAP)
    renderDrawer()
    expect(tiles()).toHaveLength(VISIBLE_PINNED_CAP)
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument()
  })

  it('navigates to the app and closes the drawer when a tile is activated', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })
    renderDrawer()

    fireEvent.click(within(strip()).getByRole('button', { name: 'Token Mint' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/apps/token-mint')
    expect(document.getElementById('app-nav-drawer').className).not.toContain('open')
  })

  it('marks the tile for the app the member is inside as the current page', () => {
    pin(2)
    renderDrawer('/apps/app-2')

    expect(within(strip()).getByRole('button', { name: 'App 2' })).toHaveAttribute('aria-current', 'page')
    expect(within(strip()).getByRole('button', { name: 'App 1' })).not.toHaveAttribute('aria-current')
  })

  it('shows the same curated store artwork the catalog card shows, keyed by slug', () => {
    addFavoriteApp({ id: 12, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 13, slug: 'not-a-curated-app', name: 'Something Else' })
    renderDrawer()

    const [curated, generic] = tiles()
    // Decorative: the button's accessible name carries the identity, so the art never has to.
    for (const tile of [curated, generic]) {
      const art = tile.querySelector('svg.miniapp-art')
      expect(art).toBeTruthy()
      expect(art).toHaveAttribute('aria-hidden', 'true')
    }
    // artworkFor is total — an uncurated app gets the generic illustration, never a broken image
    // and never another app's identity — so the two tiles must not draw the same thing.
    expect(curated.querySelector('svg.miniapp-art').innerHTML)
      .not.toBe(generic.querySelector('svg.miniapp-art').innerHTML)
  })

  it('keeps the full app name as the accessible name even though the visible label truncates', () => {
    const longName = 'An Extremely Long Mini-App Name That Cannot Fit A 56px Tile'
    addFavoriteApp({ id: 7, slug: 'long', name: longName })
    renderDrawer()

    const tile = within(strip()).getByRole('button', { name: longName })
    expect(tile).toHaveAttribute('title', longName)
    // The visible text is decorative and hidden from assistive tech — the button's own name is
    // the complete one, so nothing an assistive user needs is lost to the ellipsis.
    expect(tile.querySelector('.pinned-app-tile-label')).toHaveAttribute('aria-hidden', 'true')
  })

  it('leaves Quick Access as Payments and Accounts only — pins never become rows again', () => {
    pin(3)
    const { container } = renderDrawer()

    const rowLabels = Array.from(
      container.querySelectorAll('.portal-nav-group-items .portal-nav-item-label')
    ).map((el) => el.textContent)
    expect(rowLabels).toContain('Payments')
    expect(rowLabels).toContain('Accounts')
    expect(rowLabels).not.toContain('App 1')
  })

  it('renders the strip above the section list, not inside it', () => {
    pin(1)
    const { container } = renderDrawer()
    expect(strip().compareDocumentPosition(container.querySelector('.portal-nav')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('does not render the strip in the collapsed desktop gutter', () => {
    pin(3)
    render(
      <MemoryRouter initialEntries={['/app']}>
        <NavDrawerProvider>
          <AppNavDrawer />
        </NavDrawerProvider>
      </MemoryRouter>
    )
    expect(document.getElementById('app-nav-drawer').className).toContain('collapsed')
    expect(strip()).toBeNull()
  })
})

/*
 * Spec 093 follow-up — pinned ADMIN TOOLS ride the same strip.
 *
 * An operator pins a tool from the store's Operator tools section; the pin is
 * a favorites entry in the reserved `admin-tool:` namespace, renders as a
 * glyph tile (no registry record ⇒ no store artwork), routes to the tool's
 * /admin address, and highlights itself while that tool is open.
 */
describe('AppNavDrawer — pinned admin tools (spec 093 follow-up)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoriteAppsForTests()
    __resetNavPreferencesForTests()
  })

  it('renders an admin pin as a glyph tile and routes it to /admin/<appId>', () => {
    addFavoriteApp({ id: 'admin-tool:incident-response', name: 'Incident Response' })
    renderDrawer()

    const tile = within(strip()).getByRole('button', { name: 'Incident Response' })
    // Glyph, not store artwork: the tile carries an svg from NavIcon.
    expect(tile.querySelector('.pinned-app-tile-icon svg')).toBeTruthy()

    fireEvent.click(tile)
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/incident-response')
  })

  it('mixes with registry pins in one strip, in pin order', () => {
    addFavoriteApp({ id: 7, slug: 'token-mint', name: 'Token Mint' })
    addFavoriteApp({ id: 'admin-tool:maintenance', name: 'Maintenance' })
    renderDrawer()

    expect(tiles().map((t) => t.getAttribute('aria-label'))).toEqual(['Token Mint', 'Maintenance'])
  })

  it('highlights the pinned tool while its /admin screen is open', () => {
    addFavoriteApp({ id: 'admin-tool:maintenance', name: 'Maintenance' })
    renderDrawer('/admin/maintenance')

    expect(within(strip()).getByRole('button', { name: 'Maintenance' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('drops a malformed admin-tool favorite rather than rendering a dead tile', () => {
    // Written straight into storage to simulate a corrupt/stale entry.
    localStorage.setItem(
      'fw_global_prefs',
      JSON.stringify({ miniapp_favorites: [{ id: 'admin-tool:UPPER CASE!', name: 'Bad' }] }),
    )
    __resetFavoriteAppsForTests()
    renderDrawer()
    expect(strip()).toBeNull()
  })
})
