/**
 * WalletPage ?tab=collectibles deep link (spec 055 US1/T018) — renders the panel where the
 * feature is available; falls back to Account on unsupported networks or with no gateway
 * (FR-007), including for direct deep links (SC-003: no dead surfaces anywhere).
 *
 * Own file (not WalletPage.test.jsx) because these cases need a DIFFERENT useChainTokens
 * mock per test, and that file pins one module-scope mock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WalletPage from '../../pages/WalletPage'
import { WalletContext, UIContext } from '../../contexts'
import { useChainTokens } from '../../hooks/useChainTokens'

vi.mock('../../components/fairwins/TradePanel', () => ({ default: () => <div data-testid="trade-panel" /> }))
vi.mock('../../components/ui/PremiumPurchaseModal', () => ({ default: () => <div data-testid="premium-modal" /> }))
vi.mock('../../components/collectibles/CollectiblesPanel', () => ({
  default: () => <div data-testid="collectibles-panel" />,
}))
vi.mock('../../components/wallet/PortfolioPanel', () => ({
  default: () => <div data-testid="portfolio-panel" />,
}))
vi.mock('../../components/ui/BlockiesAvatar', () => ({
  default: () => <div data-testid="blockies-avatar" />,
}))
// Spec 074 — the Account tab body is the unified view (card carousel +
// Portfolio/Activity/Stats). Mock the portfolio hook (the default view's data
// seam, also mounted for the card total) and the switcher seam so the
// fallback-to-Account cases stay free of multi-chain scans and custody/legacy
// async loads.
vi.mock('../../hooks/usePortfolio', () => {
  const usePortfolio = () => ({
    status: 'ready',
    isLoading: false,
    error: null,
    holdings: [],
    aggregates: [],
    categories: [],
    totalUsd: 0,
    failedAssets: [],
    priceMap: new Map(),
    showTestnetAssets: false,
    showZeroBalances: false,
    lastUpdated: null,
    refresh: vi.fn(),
  })
  return { default: usePortfolio, usePortfolio }
})
vi.mock('../../hooks/useAccountSwitcher', () => {
  const useAccountSwitcher = () => ({
    accounts: [
      {
        id: 'personal',
        kind: 'personal',
        address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
        label: 'Personal wallet',
      },
    ],
    currentId: 'personal',
    choose: vi.fn(),
    unlockEntry: null,
    setUnlockEntry: vi.fn(),
    onUnlocked: vi.fn(),
    hasChoices: false,
  })
  return {
    useAccountSwitcher,
    default: useAccountSwitcher,
    ACCOUNT_KIND_TAG: { vault: 'Multisig', legacy: 'Recovered' },
    shortAccountAddr: (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''),
  }
})
vi.mock('../../hooks/useEncryption', () => ({
  useEncryption: () => ({ isInitialized: false, isInitializing: false, ensureInitialized: vi.fn() }),
}))
vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: { polymarketCategories: [] }, setPolymarketCategories: vi.fn() }),
}))
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: vi.fn() }))
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

function renderPage(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UIContext.Provider value={uiContext}>
        <WalletContext.Provider value={walletContext}>
          <WalletPage />
        </WalletContext.Provider>
      </UIContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_RELAYER_URL', 'https://relay.example')
  useChainTokens.mockReturnValue({ capabilities: { collectibles: true } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('WalletPage — ?tab=collectibles deep link', () => {
  it('renders the Collectibles panel on a supported network with a configured gateway', () => {
    const { container } = renderPage('/wallet?tab=collectibles')
    expect(container.querySelector('.collectibles-section')).toBeTruthy()
  })

  it('falls back to Account on networks without the capability (FR-007)', () => {
    useChainTokens.mockReturnValue({ capabilities: { collectibles: false } })
    const { container } = renderPage('/wallet?tab=collectibles')
    expect(container.querySelector('.collectibles-section')).toBeNull()
    expect(container.querySelector('.profile-section')).toBeTruthy()
  })

  it('falls back to Account when no gateway is configured (soft-fail, never a dead tab)', () => {
    vi.stubEnv('VITE_RELAYER_URL', '')
    const { container } = renderPage('/wallet?tab=collectibles')
    expect(container.querySelector('.collectibles-section')).toBeNull()
    expect(container.querySelector('.profile-section')).toBeTruthy()
  })

  it('redirects the legacy ?tab=portfolio deep link into the unified My Account view (spec 074)', () => {
    useChainTokens.mockReturnValue({ capabilities: { collectibles: false } })
    const { container, getByTestId } = renderPage('/wallet?tab=portfolio')
    expect(container.querySelector('.collectibles-section')).toBeNull()
    // The saved link lands on My Account with the Portfolio view active.
    expect(container.querySelector('.profile-section')).toBeTruthy()
    expect(getByTestId('portfolio-panel')).toBeTruthy()
  })
})
