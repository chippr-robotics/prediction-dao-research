import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    it('shows a Refund button on exactly the wager that needs a refund', async () => {
      const user = userEvent.setup()
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': 'refund', '2': null }
      })
      const markets = [wagerOne(), wagerTwo()]

      await act(async () => {
        render(modalUi(markets))
      })

      // Actions live in the expanded card — open Wager One to reveal them.
      await user.click(screen.getByText('Wager One'))
      const card1 = screen.getByText('Wager One').closest('.wc-card')
      expect(within(card1).getByRole('button', { name: /^refund$/i })).toBeInTheDocument()
      // The button replaces the badge — no redundant status pill.
      expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)

      // Wager Two needs nothing — even expanded it has no Refund.
      await user.click(screen.getByText('Wager Two'))
      const card2 = screen.getByText('Wager Two').closest('.wc-card')
      expect(within(card2).queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument()
    })

    it('shows a Respond to Draw button when a draw is proposed', async () => {
      const user = userEvent.setup()
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': 'respondDraw' }
      })

      await act(async () => {
        render(modalUi([wagerOne()]))
      })

      await user.click(screen.getByText('Wager One'))
      const card = screen.getByText('Wager One').closest('.wc-card')
      expect(within(card).getByRole('button', { name: /respond to draw/i })).toBeInTheDocument()
      expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)
    })

    // Every action kind now has a matching button in the Actions column, so the
    // duplicate status badge is suppressed across the board.
    it.each(['accept', 'claim', 'resolve', 'refund', 'respondDraw'])(
      'does not render a redundant status badge for "%s"',
      async (kind) => {
        activityRef.current = baseActivity({
          actionNeededByWagerId: { '1': kind }
        })

        await act(async () => {
          render(modalUi([wagerOne()]))
        })

        expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)
      }
    )

    it('removes the Refund button when the action is no longer needed', async () => {
      const user = userEvent.setup()
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': 'refund', '2': null }
      })
      const markets = [wagerOne(), wagerTwo()]

      let view
      await act(async () => {
        view = render(modalUi(markets))
      })

      // Expand Wager One to reveal its Refund action.
      await user.click(screen.getByText('Wager One'))
      expect(screen.getByRole('button', { name: /^refund$/i })).toBeInTheDocument()

      activityRef.current = baseActivity({
        actionNeededByWagerId: { '1': null, '2': null }
      })
      await act(async () => {
        view.rerender(modalUi(markets))
      })

      expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument()
      expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)
    })

    it('suppresses the "refund" badge when the row shows a Clear/Reclaim button', async () => {
      const user = userEvent.setup()
      // An expired pending offer → computedStatus EXPIRED → the row renders a
      // Clear button, which makes the "refund" action badge redundant.
      const expired = {
        id: '7',
        description: 'Expired Offer',
        creator: OTHER,
        participants: [ME],
        status: 'pending_acceptance',
        acceptanceDeadline: Date.now() - 60 * 60 * 1000,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        marketType: 'friend'
      }
      activityRef.current = baseActivity({
        actionNeededByWagerId: { '7': 'refund' }
      })

      await act(async () => {
        render(modalUi([expired]))
      })

      // Expired offers are hidden under the default "all" filter — switch to Expired.
      const statusSelect = screen.getAllByRole('combobox')[1]
      await act(async () => {
        await user.selectOptions(statusSelect, 'expired')
      })

      expect(screen.getByText('Expired Offer')).toBeInTheDocument()
      // Expand the card to reveal its actions.
      await user.click(screen.getByText('Expired Offer'))
      // The Clear button is present, so the refund badge is suppressed.
      expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument()
      expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)
    })

    it('renders without crashing (and without badges) outside the provider', async () => {
      activityRef.current = null

      await act(async () => {
        render(modalUi([wagerOne()]))
      })

      expect(screen.getByText('Wager One')).toBeInTheDocument()
      expect(document.querySelectorAll('.wc-action-needed')).toHaveLength(0)
    })
  })
})
