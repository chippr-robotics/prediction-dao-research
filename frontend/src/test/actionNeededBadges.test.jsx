import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../components/fairwins/Dashboard'
import MyMarketsModal from '../components/fairwins/MyMarketsModal'
import {
  WalletContext,
  ThemeContext,
  UIContext,
  FriendMarketsContext,
  UserPreferencesContext,
  DexContext
} from '../contexts'

const ME = '0x1234567890123456789012345678901234567890'
const OTHER = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

// Identity-stable wager-activity context handle. Tests assign
// activityRef.current per scenario; the mocked hooks read it lazily so the
// SAME object is returned on every render (no effect loops). null simulates
// rendering outside WagerActivityProvider (legacy trees).
const activityRef = vi.hoisted(() => ({ current: null }))

vi.mock('../hooks/useWagerActivity', () => ({
  useWagerActivity: () => {
    if (!activityRef.current) {
      throw new Error('useWagerActivity must be used within a WagerActivityProvider')
    }
    return activityRef.current
  },
  useWagerActivityOptional: () => activityRef.current
}))

// Canonical wallet/context hook mock set (see MyMarketsModal.test.jsx).
vi.mock('../hooks', () => ({
  useWallet: vi.fn(),
  useWeb3: vi.fn(),
  useWalletRoles: vi.fn(),
  useWalletConnection: vi.fn(),
  useLazyIpfsEnvelope: vi.fn((markets) => ({
    markets: markets || [],
    fetchEnvelope: vi.fn().mockResolvedValue(null),
    isMarketFetching: vi.fn().mockReturnValue(false),
    needsFetch: vi.fn().mockReturnValue(false),
    clearEnvelope: vi.fn()
  }))
}))

vi.mock('../hooks/useEncryption', () => ({
  useEncryption: vi.fn(() => ({})),
  useLazyMarketDecryption: vi.fn((markets) => ({
    markets: (markets || []).map(m => ({
      ...m,
      encryptionStatus: 'not_encrypted',
      isPrivate: false,
      canView: true
    })),
    decryptMarket: vi.fn().mockResolvedValue({}),
    isMarketDecrypting: vi.fn().mockReturnValue(false),
    isAnyDecrypting: false,
    clearCache: vi.fn()
  }))
}))

// Keep the heavy create-wager modal out of the Dashboard tree.
vi.mock('../components/fairwins/FriendMarketsModal', () => ({
  default: () => null
}))

import { useWallet, useWeb3, useWalletRoles, useWalletConnection } from '../hooks'

const baseActivity = (overrides = {}) => ({
  entries: [],
  unreadCount: 0,
  isPolling: false,
  lastPolledAt: null,
  markEntryRead: vi.fn(),
  markWagerRead: vi.fn(),
  markAllRead: vi.fn(),
  actionNeededByWagerId: {},
  actionNeededCount: 0,
  refresh: vi.fn(),
  ...overrides
})

const futureEnd = () => BigInt(Math.floor(Date.now() / 1000) + 86400 * 7)

const wagerOne = () => ({
  id: '1',
  description: 'Wager One',
  creator: OTHER,
  participants: [ME],
  status: 'active',
  marketType: 'friend',
  tradingEndTime: futureEnd()
})

const wagerTwo = () => ({
  id: '2',
  description: 'Wager Two',
  creator: OTHER,
  participants: [ME],
  status: 'active',
  marketType: 'friend',
  tradingEndTime: futureEnd()
})

describe('Action-needed badges (spec 012 T023, FR-007)', () => {
  const walletCtx = {
    account: ME,
    address: ME,
    isConnected: true,
    chainId: 63,
    provider: null,
    signer: null,
    roles: [],
    rolesLoading: false,
    blockchainSynced: true,
    hasRole: vi.fn(() => true),
    hasAnyRole: vi.fn(() => true),
    hasAllRoles: vi.fn(() => true),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
    refreshRoles: vi.fn()
  }

  const themeCtx = { theme: 'dark', toggleTheme: vi.fn(), setTheme: vi.fn() }

  const uiCtx = {
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
    clearError: vi.fn()
  }

  const prefsCtx = {
    preferences: { recentSearches: [], favoriteMarkets: [], defaultSlippage: 0.5 },
    isLoading: false,
    addRecentSearch: vi.fn(),
    clearRecentSearches: vi.fn(),
    toggleFavoriteMarket: vi.fn(),
    setDefaultSlippage: vi.fn(),
    savePreference: vi.fn(),
    clearAllPreferences: vi.fn()
  }

  const dexCtx = {
    balances: { native: '0', wnative: '0', stable: '0' },
    loading: false,
    isDexAvailable: false,
    chainId: 63,
    tokens: {},
    addresses: {}
  }

  const friendMarketsCtx = (friendMarkets = []) => ({
    friendMarkets,
    loading: false,
    refresh: vi.fn(),
    addMarket: vi.fn(),
    setFriendMarkets: vi.fn(),
    dismissedIds: new Set(),
    dismissMarket: vi.fn(),
    dismissMarkets: vi.fn(),
    restoreMarket: vi.fn(),
    isDismissed: vi.fn(() => false)
  })

  const withProviders = (children, friendMarkets = []) => (
    <MemoryRouter initialEntries={['/app']}>
      <ThemeContext.Provider value={themeCtx}>
        <UIContext.Provider value={uiCtx}>
          <WalletContext.Provider value={walletCtx}>
            <UserPreferencesContext.Provider value={prefsCtx}>
              <FriendMarketsContext.Provider value={friendMarketsCtx(friendMarkets)}>
                <DexContext.Provider value={dexCtx}>
                  {children}
                </DexContext.Provider>
              </FriendMarketsContext.Provider>
            </UserPreferencesContext.Provider>
          </WalletContext.Provider>
        </UIContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>
  )

  const modalUi = (friendMarkets) =>
    withProviders(
      <MyMarketsModal isOpen onClose={vi.fn()} friendMarkets={friendMarkets} />,
      friendMarkets
    )

  beforeEach(() => {
    vi.clearAllMocks()
    global.window.ethereum = undefined
    activityRef.current = null
    useWallet.mockReturnValue({ isConnected: true, account: ME, chainId: 63 })
    useWeb3.mockReturnValue({ signer: {}, isCorrectNetwork: true, switchNetwork: vi.fn(), chainId: 63 })
    useWalletRoles.mockReturnValue({ hasRole: vi.fn(() => true) })
    useWalletConnection.mockReturnValue({ connectWallet: vi.fn() })
  })

  describe('Dashboard My Wagers entry point', () => {
    it('badges the My Wagers quick action with accessible text when actions are needed', () => {
      activityRef.current = baseActivity({ actionNeededCount: 2 })
      render(withProviders(<Dashboard />))

      const card = screen.getByRole('button', { name: /my wagers/i })
      expect(within(card).getByText('2')).toBeInTheDocument()
      expect(within(card).getByText('2 wagers need action')).toBeInTheDocument()
    })

    it('uses the singular form for a single action-needed wager', () => {
      activityRef.current = baseActivity({ actionNeededCount: 1 })
      render(withProviders(<Dashboard />))

      const card = screen.getByRole('button', { name: /my wagers/i })
      expect(within(card).getByText('1 wager needs action')).toBeInTheDocument()
    })

    it('shows no badge when nothing needs action', () => {
      activityRef.current = baseActivity({ actionNeededCount: 0 })
      render(withProviders(<Dashboard />))

      expect(screen.getByRole('button', { name: /my wagers/i })).toBeInTheDocument()
      expect(screen.queryByText(/needs? action/)).not.toBeInTheDocument()
    })

    it('renders without crashing (and without badges) outside the provider', () => {
      activityRef.current = null
      render(withProviders(<Dashboard />))

      expect(screen.getByRole('button', { name: /my wagers/i })).toBeInTheDocument()
      expect(screen.queryByText(/needs? action/)).not.toBeInTheDocument()
    })
  })

  describe('MyMarketsModal wager cards', () => {
    it('shows an action badge on exactly the wager that needs action', async () => {
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': 'claim', '2': null }
      })
      const markets = [wagerOne(), wagerTwo()]

      await act(async () => {
        render(modalUi(markets))
      })

      const row1 = screen.getByText('Wager One').closest('tr')
      expect(within(row1).getByText('Claim')).toBeInTheDocument()

      // Wager 2 (action kind null) has no badge — exactly one in the document.
      expect(document.querySelectorAll('.mm-action-needed-badge')).toHaveLength(1)
      const row2 = screen.getByText('Wager Two').closest('tr')
      expect(within(row2).queryByText('Claim')).not.toBeInTheDocument()
    })

    it.each([
      ['accept', 'Accept'],
      ['resolve', 'Resolve'],
      ['claim', 'Claim'],
      ['refund', 'Refund'],
      ['respondDraw', 'Respond to draw']
    ])('labels a "%s" action badge "%s"', async (kind, label) => {
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': kind }
      })

      await act(async () => {
        render(modalUi([wagerOne()]))
      })

      const row = screen.getByText('Wager One').closest('tr')
      expect(within(row).getByText(label)).toBeInTheDocument()
    })

    it('removes the badge when the action is no longer needed', async () => {
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': 'claim', '2': null }
      })
      const markets = [wagerOne(), wagerTwo()]

      let view
      await act(async () => {
        view = render(modalUi(markets))
      })

      expect(screen.getByText('Claim')).toBeInTheDocument()

      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': null, '2': null }
      })
      await act(async () => {
        view.rerender(modalUi(markets))
      })

      expect(screen.queryByText('Claim')).not.toBeInTheDocument()
      expect(document.querySelectorAll('.mm-action-needed-badge')).toHaveLength(0)
    })

    it('renders without crashing (and without badges) outside the provider', async () => {
      activityRef.current = null

      await act(async () => {
        render(modalUi([wagerOne()]))
      })

      expect(screen.getByText('Wager One')).toBeInTheDocument()
      expect(document.querySelectorAll('.mm-action-needed-badge')).toHaveLength(0)
    })
  })
})
