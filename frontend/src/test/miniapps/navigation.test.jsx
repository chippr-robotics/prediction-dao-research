/**
 * Spec 073 T025 (US1, FR-009) — the Apps navigation rewire, and the legacy deep links it must
 * not break.
 *
 * The nav change itself is small: the Apps group stopped naming apps and now names the catalog.
 * The part worth a test file is the half that must be INVISIBLE. Existing members have
 * `?tab=clearpath` and `?tab=tokens` in bookmarks, in shared links, and in browser history, and
 * the rule this file pins down is:
 *
 *   removing a tab from the MENU is not the same as removing the tab.
 *
 * The two legacy tabs are at DIFFERENT stages, and the difference is the point:
 *
 *   - `?tab=tokens` REDIRECTS to /apps/token-mint. Token Mint's tree has moved into
 *     `frontend/miniapps/token-mint/`, so the host has nothing left to render on that tab — the
 *     saved link has to go where the feature actually lives (T026/T027).
 *   - `?tab=clearpath` still renders its host-native panel. Its package is built in T029, and
 *     redirecting before then would resolve a slug the registry has never heard of, turning a
 *     link that worked yesterday into a dead end.
 *
 * The catalog panel and the workspace are exercised by their own suites (CatalogPanel.test.jsx,
 * MiniAppWorkspace.test.jsx). Here the panel is a stub — what is under test is which section the
 * host decides to render, not what that section then reads from the chain.
 */
import { useEffect } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { WalletContext, UIContext } from '../../contexts'
import { NavDrawerProvider } from '../../contexts/NavDrawerContext.jsx'
import { useNavDrawer } from '../../contexts/NavDrawerContext.js'

// --- Panel stubs -------------------------------------------------------------------------------
// Each stub stands for "this section rendered". The mini-app catalog is stubbed alongside the two
// legacy panels on purpose: the assertions below are about WHICH of the three the host picked for
// a given URL, and a real CatalogPanel would drag a registry read into a routing test.
vi.mock('../../components/miniapps/CatalogPanel', () => ({
  default: () => <div data-testid="catalog-panel" />,
}))
vi.mock('../../components/fairwins/TradePanel', () => ({
  default: () => <div data-testid="trade-panel" />,
}))
vi.mock('../../components/ui/PremiumPurchaseModal', () => ({
  default: () => <div data-testid="premium-modal" />,
}))

// The same hermetic hook stack the other WalletPage suites use — the page pulls in encryption,
// preferences, chain capabilities and account stats that have nothing to do with routing.
vi.mock('../../hooks/useEncryption', () => ({
  useEncryption: () => ({ isInitialized: false, isInitializing: false, ensureInitialized: vi.fn() }),
}))
vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: { polymarketCategories: [] },
    setPolymarketCategories: vi.fn(),
  }),
}))
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => ({ capabilities: {} }) }))
vi.mock('../../hooks/useAccountStats', () => ({
  useAccountStats: () => ({
    summary: null,
    series: { range: '30D', points: [], isEmpty: true, isLowData: true, endValueUsd: 0 },
    setRange: vi.fn(),
    breakdowns: null,
    activity: [],
    isConnected: true,
    isSupportedNetwork: true,
    chainId: 137,
    isLoading: false,
    isEmpty: true,
    error: null,
    freshness: { summary: { lastUpdated: null, status: 'fresh' } },
    refresh: vi.fn(),
  }),
}))
vi.mock('../../utils/keyRegistryService', () => ({
  hasRegisteredKey: vi.fn().mockResolvedValue(false),
  ensureKeyRegistered: vi.fn(),
}))

import WalletPage from '../../pages/WalletPage'
import AppNavDrawer from '../../components/nav/AppNavDrawer'
import { __resetNavPreferencesForTests } from '../../lib/nav/navPreferences'

const walletContext = {
  address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  isConnected: true,
  connectors: [],
  provider: null,
  signer: null,
  chainId: 137,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  roles: [],
  rolesLoading: false,
  blockchainSynced: true,
  refreshRoles: vi.fn(),
  hasRole: vi.fn().mockReturnValue(false),
  hasAnyRole: vi.fn().mockReturnValue(false),
  hasAllRoles: vi.fn().mockReturnValue(false),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}

const uiContext = {
  modal: null,
  showModal: vi.fn(),
  hideModal: vi.fn(),
  notification: null,
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
  announcement: null,
  announce: vi.fn(),
  error: null,
  showError: vi.fn(),
  clearError: vi.fn(),
}

function renderWalletPage(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UIContext.Provider value={uiContext}>
        <WalletContext.Provider value={walletContext}>
          <WalletPage />
          {/* Renders the live path, so a REDIRECT can be asserted rather than inferred from
              whichever section happened to render. */}
          <LocationProbe />
        </WalletContext.Provider>
      </UIContext.Provider>
    </MemoryRouter>
  )
}

/**
 * The same tree for a WalletPage re-imported against a mocked tenant manifest.
 *
 * A re-imported page consumes a re-imported WalletContext, so it has to be given the providers
 * from its OWN module graph — handing it the statically imported pair looks like "no provider" to
 * it and throws. `reimported` is `{ Component, contexts }` from `withoutMiniApps` below.
 */
function renderReimportedWalletPage(route, reimported) {
  const Page = reimported.Component
  const Wallet = reimported.contexts.WalletContext
  const UI = reimported.contexts.UIContext
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UI.Provider value={uiContext}>
        <Wallet.Provider value={walletContext}>
          <Page />
        </Wallet.Provider>
      </UI.Provider>
    </MemoryRouter>
  )
}

// --- The Apps tab ------------------------------------------------------------------------------

describe('WalletPage — the Apps tab hosts the mini-app catalog (spec 073 FR-009)', () => {
  it('renders the catalog at ?tab=apps', () => {
    const { container } = renderWalletPage('/wallet?tab=apps')
    expect(screen.getByTestId('catalog-panel')).toBeInTheDocument()
    expect(container.querySelector('.apps-section')).toBeTruthy()
    // Not bounced to the Account fallback, which is what an unknown tab id would do.
    expect(container.querySelector('.profile-section')).toBeNull()
  })

  it('gives the section a tabpanel role like every other section', () => {
    const { container } = renderWalletPage('/wallet?tab=apps')
    expect(container.querySelector('.apps-section')).toHaveAttribute('role', 'tabpanel')
  })
})

// --- Legacy deep links (the point of this file) -------------------------------------------------

describe('WalletPage — legacy Apps deep links keep working (spec 073 FR-009, R11 phasing)', () => {
  it('?tab=clearpath REDIRECTS to the ClearPath mini-app (T029 cutover)', () => {
    const { container } = renderWalletPage('/wallet?tab=clearpath')
    expect(screen.getByTestId('loc')).toHaveTextContent('/apps/clearpath')
    expect(container.querySelector('.clearpath-section')).toBeNull()
  })

  it('?tab=tokens REDIRECTS to the Token Mint mini-app (T027 cutover)', () => {
    // Token Mint is a package now, so the old tab cannot render it — the saved deep link has to
    // resolve to the workspace instead of silently falling back to the account tab.
    const { container } = renderWalletPage('/wallet?tab=tokens')
    expect(screen.getByTestId('loc')).toHaveTextContent('/apps/token-mint')
    expect(container.querySelector('.tokens-section')).toBeNull()
  })

  it('keeps every other saved tab resolving exactly as before', () => {
    // A spot check on both an alias and a plain tab id: the rewire touched the Apps group only.
    expect(renderWalletPage('/wallet?tab=swap').container.querySelector('.trade-section')).toBeTruthy()
    expect(
      renderWalletPage('/wallet?tab=reports').container.querySelector('.reports-section')
    ).toBeTruthy()
  })

  it('still falls back to Account for a tab id nothing serves', () => {
    // The contrast that gives the assertions above their meaning: this IS what a dead deep link
    // looks like, and neither legacy tab does it.
    const { container } = renderWalletPage('/wallet?tab=definitely-not-a-tab')
    expect(container.querySelector('.profile-section')).toBeTruthy()
  })
})

// --- The nav drawer ----------------------------------------------------------------------------

// The drawer is aria-hidden while closed, so open it on mount — mirrors the clover-logo trigger.
function OpenOnMount() {
  const { open } = useNavDrawer()
  useEffect(() => {
    open()
  }, [open])
  return null
}

function LocationProbe() {
  const location = useLocation()
  return (
    <div data-testid="loc">
      {location.pathname}
      {location.search}
    </div>
  )
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

// Spec 081: the Apps catalog entry moved into TOOLS (a group that could only ever hold that one
// row did not earn a heading of its own), and Tools is an accordion that defaults to folded — so
// the entry is UNMOUNTED until the header is activated. The header is named "Tools section" so a
// group heading is never confusable with an item inside it.
function openAppsSection() {
  fireEvent.click(screen.getByRole('button', { name: 'Tools section' }))
}

describe('AppNavDrawer — the Apps entry after the rewire (spec 073 FR-009)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetNavPreferencesForTests()
  })

  it('offers one Apps entry, inside Tools, and no per-app entries', () => {
    renderDrawer()
    openAppsSection()
    expect(screen.getByRole('button', { name: 'Apps' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ClearPath' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Token Mint' })).toBeNull()
  })

  it('routes the Apps entry to the catalog tab', () => {
    renderDrawer()
    openAppsSection()
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=apps')
  })

  it('offers no Wagers entry — it is a view inside Transfer now, reached through that entry', () => {
    // Wagers did not become a package (T030–T033 retired); it moved into Finance ▸ Transfer. The
    // drawer used to splice it into this group, and that splice must be gone, not merely repointed:
    // a menu entry beside Apps that lands on a sub-view of Transfer would highlight neither.
    renderDrawer()
    expect(screen.queryByRole('button', { name: 'Wagers' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=paytransfer')
  })

  it('highlights Apps while a mini-app workspace is mounted', () => {
    // `/apps/<slug>` is where a catalog launch lands, so the menu keeps pointing at the section
    // the member is actually in rather than showing nothing selected.
    renderDrawer('/apps/token-mint')
    // No openAppsSection(): the section holding the current page force-expands (spec 081 FR-004),
    // so the highlighted entry is never hidden inside a fold.
    expect(screen.getByRole('button', { name: 'Apps' })).toHaveAttribute('aria-current', 'page')
  })

  it('highlights Apps for the catalog tab itself', () => {
    renderDrawer('/wallet?tab=apps')
    expect(screen.getByRole('button', { name: 'Apps' })).toHaveAttribute('aria-current', 'page')
  })

  it('highlights Transfer — not Apps — for the legacy /wagers route and for the view it redirects to', () => {
    // The redirect is App.jsx's job; the drawer resolves the pre-redirect render too, so the menu
    // never flashes with nothing selected on the way through.
    renderDrawer('/wagers')
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute('aria-current', 'page')
    openAppsSection()
    expect(screen.getByRole('button', { name: 'Apps' })).not.toHaveAttribute('aria-current')

    cleanup()
    renderDrawer('/wallet?tab=paytransfer&view=wagers')
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute('aria-current', 'page')
  })
})

// --- Tenant gating -----------------------------------------------------------------------------

// 'miniapps' is a tenant feature (spec 072). A tenant that has not enabled it must not see the
// Apps group AND must not be able to reach the catalog by URL — a section reachable by deep link
// but absent from every menu is precisely the "dead tab" this gating exists to prevent.
//
// The nav model is built at module load from the frozen tenant manifest, so a different tenant is
// only observable by re-importing the modules against a mocked feature set.
describe('Apps is absent for a tenant without the miniapps feature', () => {
  afterEach(() => {
    vi.doUnmock('../../config/tenant')
    vi.resetModules()
  })

  async function withoutMiniApps(modulePath) {
    vi.resetModules()
    vi.doMock('../../config/tenant', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        isFeatureEnabled: (id) => id !== 'miniapps' && actual.isFeatureEnabled(id),
      }
    })
    // The contexts come from the same fresh module graph as the component — a re-imported page
    // consumes a re-imported context, and pairing it with the statically imported one would look
    // like "no provider" to it.
    const [module, contexts] = await Promise.all([import(modulePath), import('../../contexts')])
    return { Component: module.default, contexts }
  }

  it('hides the Apps entry from the drawer while keeping Wagers reachable', async () => {
    const reimported = await withoutMiniApps('../../components/nav/AppNavDrawer')
    const Drawer = reimported.Component
    // Rendered without the drawer provider on purpose: on desktop the drawer is a persistent
    // collapsed gutter that still renders every entry with its accessible name (the label is
    // visually hidden, not removed), so entry presence and routing are fully observable here —
    // and re-importing the provider/hook pair just to open it would only re-create the
    // fresh-vs-static context mismatch this block already has to manage for WalletPage.
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Drawer />
        <LocationProbe />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: 'Apps' })).toBeNull()
    /*
     * A mini-app feature flag must not decide whether WAGERS is reachable. That used to need
     * defending in the drawer, which spliced Wagers into this very group and so had to re-create
     * the group when the flag removed it. Wagers now rides Finance ▸ Transfer — a core item no
     * tenant flag touches — so the property holds by construction. Asserted anyway, because it is
     * the property that matters and the next person to reorganise the menu should trip this test
     * rather than discover it from a member.
     */
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/wallet?tab=paytransfer')
  })

  it('falls the ?tab=apps deep link back to Account instead of rendering an empty section', async () => {
    const reimported = await withoutMiniApps('../../pages/WalletPage')
    const { container } = renderReimportedWalletPage('/wallet?tab=apps', reimported)
    expect(screen.queryByTestId('catalog-panel')).toBeNull()
    expect(container.querySelector('.apps-section')).toBeNull()
    expect(container.querySelector('.profile-section')).toBeTruthy()
  })

  it('redirects the legacy tabs for that tenant too, rather than resurrecting a panel', async () => {
    // The `miniapps` feature governs the CATALOG. Both former tabs are packages now, so a tenant
    // that opted out of mini-apps has nothing to serve either way — and the redirect landing on
    // the catalog's honest unavailable state beats a tab silently falling back to Account.
    const reimported = await withoutMiniApps('../../pages/WalletPage')
    expect(
      renderReimportedWalletPage('/wallet?tab=clearpath', reimported).container.querySelector(
        '.clearpath-section'
      )
    ).toBeNull()
  })
})
