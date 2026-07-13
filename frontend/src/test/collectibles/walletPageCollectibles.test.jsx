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

  it('filters Collectibles out of the Finance section bottom bar on unsupported networks', () => {
    useChainTokens.mockReturnValue({ capabilities: { collectibles: false } })
    const { container } = renderPage('/wallet?tab=portfolio')
    expect(container.querySelector('.collectibles-section')).toBeNull()
    // The rest of the Finance panels still render normally.
    expect(container.querySelector('.portfolio-section')).toBeTruthy()
  })
})
