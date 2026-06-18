import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
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

// Identity-stable wager-activity context handle (see actionNeededBadges.test.jsx).
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

// Wager 42 — the feed-entry target. The connected account participates, so
// it lands in the default Participating tab.
const wager42 = () => ({
  id: '42',
  description: 'Feed Target Wager',
  creator: OTHER,
  participants: [ME],
  status: 'active',
  marketType: 'friend',
  tradingEndTime: futureEnd()
})

describe('Feed → wager navigation (spec 012 T018, FR-004/FR-016)', () => {
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
  )

  const renderDashboard = async (initialEntries, friendMarkets) => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={initialEntries}>
          {withProviders(<Dashboard />, friendMarkets)}
        </MemoryRouter>
      )
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    global.window.ethereum = undefined
    activityRef.current = baseActivity()
    useWallet.mockReturnValue({ isConnected: true, account: ME, chainId: 63 })
    useWeb3.mockReturnValue({ signer: {}, isCorrectNetwork: true, switchNetwork: vi.fn(), chainId: 63 })
    useWalletRoles.mockReturnValue({ hasRole: vi.fn(() => true) })
    useWalletConnection.mockReturnValue({ connectWallet: vi.fn() })
  })

  it('auto-opens My Wagers at the wager detail view from router state', async () => {
    await renderDashboard(
      [{ pathname: '/app', state: { openWagerId: '42' } }],
      [wager42()]
    )

    // The modal is open directly on the wager's detail view (not the list).
    expect(await screen.findByRole('button', { name: /back to list/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: /feed target wager/i })
    ).toBeInTheDocument()
  })

  it('marks the wager read when opened via router state (FR-004)', async () => {
    await renderDashboard(
      [{ pathname: '/app', state: { openWagerId: '42' } }],
      [wager42()]
    )

    await screen.findByRole('button', { name: /back to list/i })
    expect(activityRef.current.markWagerRead).toHaveBeenCalledWith('42')
  })

  it('marks the wager read when the user clicks a wager card (FR-004)', async () => {
    await renderDashboard(['/app'], [wager42()])

    // Open My Wagers normally via the quick action.
    await act(async () => {
      fireEvent.click(screen.getByText('My Wagers'))
    })

    // The list shows first — no auto-selected detail view.
    const row = await screen.findByText('Feed Target Wager')
    expect(screen.queryByRole('button', { name: /back to list/i })).not.toBeInTheDocument()
    expect(activityRef.current.markWagerRead).not.toHaveBeenCalled()

    // Expanding the card to preview the wager counts as viewing it (FR-004).
    await act(async () => {
      fireEvent.click(row)
    })
    expect(activityRef.current.markWagerRead).toHaveBeenCalledWith('42')
  })

  it('renders per-tab count badges on the pill tabs (spec 017 FR-016)', async () => {
    // One created + one participating wager — each tab shows a count badge of
    // the wagers it contains (the card-grid redesign reintroduces these).
    const markets = [
      wager42(),
      {
        id: '43',
        description: 'My Created Wager',
        creator: ME,
        participants: [ME, OTHER],
        status: 'active',
        marketType: 'friend',
        tradingEndTime: futureEnd()
      }
    ]

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          {withProviders(
            <MyMarketsModal isOpen onClose={vi.fn()} friendMarkets={markets} />,
            markets
          )}
        </MemoryRouter>
      )
    })

    // Tabs render as pills…
    const participatingTab = screen.getByRole('tab', { name: /participating/i })
    expect(participatingTab).toBeInTheDocument()
    const createdTab = screen.getByRole('tab', { name: /created/i })
    expect(createdTab).toBeInTheDocument()

    // …each with a count badge of the wagers it contains (one each here).
    expect(document.querySelectorAll('.mm-tab-count').length).toBeGreaterThan(0)
    expect(within(participatingTab).getByText('1')).toBeInTheDocument()
    expect(within(createdTab).getByText('1')).toBeInTheDocument()
  })
})
