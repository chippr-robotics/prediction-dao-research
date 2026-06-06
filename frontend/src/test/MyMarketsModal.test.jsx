import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyMarketsModal from '../components/fairwins/MyMarketsModal'
import { WalletContext, ThemeContext, UIContext, FriendMarketsContext } from '../contexts'
import { BrowserRouter } from 'react-router-dom'

// Mock hooks
vi.mock('../hooks', () => ({
  useWallet: vi.fn(() => ({
    isConnected: true,
    account: '0x1234567890123456789012345678901234567890'
  })),
  useWeb3: vi.fn(() => ({
    signer: {},
    isCorrectNetwork: true,
    switchNetwork: vi.fn()
  })),
  useMyWagers: vi.fn(() => ({
    items: [],
    sort: 'createdAt',
    filter: {},
    setSort: vi.fn(),
    setFilter: vi.fn(),
    loadMore: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    hasMore: false,
    totalKnown: 0
  })),
  useMyWagerNotifications: vi.fn(() => ({
    unreadCount: 0,
    unreadMarketIds: [],
    markMarketAsRead: vi.fn(),
    isMarketUnread: vi.fn(() => false)
  })),
  useLazyIpfsEnvelope: vi.fn((markets) => ({
    markets: markets || [],
    fetchEnvelope: vi.fn().mockResolvedValue(null),
    isMarketFetching: vi.fn().mockReturnValue(false),
    needsFetch: vi.fn().mockReturnValue(false),
    clearEnvelope: vi.fn()
  }))
}))

vi.mock('../hooks/useEncryption', () => ({
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

import { useWallet, useWeb3 } from '../hooks'

describe('MyMarketsModal', () => {
  const mockOnClose = vi.fn()

  const defaultWalletContext = {
    roles: [],
    rolesLoading: false,
    blockchainSynced: true,
    hasRole: vi.fn(() => false),
    hasAnyRole: vi.fn(() => false),
    hasAllRoles: vi.fn(() => false),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
    refreshRoles: vi.fn(),
    address: '0x1234567890123456789012345678901234567890',
    account: '0x1234567890123456789012345678901234567890',
    isConnected: true,
    provider: null,
    signer: null
  }

  const defaultThemeContext = {
    theme: 'dark',
    toggleTheme: vi.fn(),
    setTheme: vi.fn()
  }

  const defaultUIContext = {
    showModal: vi.fn(),
    hideModal: vi.fn(),
    modal: null
  }

  const defaultFriendMarketsContext = {
    friendMarkets: [],
    loading: false,
    refresh: vi.fn(),
    addMarket: vi.fn(),
    setFriendMarkets: vi.fn(),
    dismissedIds: new Set(),
    dismissMarket: vi.fn(),
    dismissMarkets: vi.fn(),
    restoreMarket: vi.fn(),
    isDismissed: vi.fn(() => false),
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      walletContext = defaultWalletContext,
      themeContext = defaultThemeContext,
      uiContext = defaultUIContext,
      friendMarketsContext = defaultFriendMarketsContext
    } = options

    return render(
      <BrowserRouter>
        <ThemeContext.Provider value={themeContext}>
          <WalletContext.Provider value={walletContext}>
            <FriendMarketsContext.Provider value={friendMarketsContext}>
              <UIContext.Provider value={uiContext}>
                {component}
              </UIContext.Provider>
            </FriendMarketsContext.Provider>
          </WalletContext.Provider>
        </ThemeContext.Provider>
      </BrowserRouter>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.ethereum to avoid provider creation errors
    global.window.ethereum = undefined
    useWallet.mockReturnValue({
      isConnected: true,
      account: '0x1234567890123456789012345678901234567890'
    })
    useWeb3.mockReturnValue({
      signer: {},
      isCorrectNetwork: true,
      switchNetwork: vi.fn()
    })
  })

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      renderWithProviders(
        <MyMarketsModal isOpen={false} onClose={mockOnClose} />
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should render when isOpen is true', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have correct ARIA attributes', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'my-markets-modal-title')
    })
  })

  describe('Header', () => {
    it('should display title', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      expect(screen.getByText('My Wagers')).toBeInTheDocument()
    })

    it('should display subtitle', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      expect(screen.getByText(/Manage your wagers and positions/)).toBeInTheDocument()
    })

    it('should have close button', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      const closeBtn = screen.getByRole('button', { name: /close modal/i })
      await user.click(closeBtn)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Tab Navigation', () => {
    it('should display three tabs', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /participating/i })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /created/i })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument()
      })
    })

    it('should have Participating tab selected by default', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        const participatingTab = screen.getByRole('tab', { name: /participating/i })
        expect(participatingTab).toHaveAttribute('aria-selected', 'true')
      })
    })

    it('should switch to Created tab when clicked', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /created/i })).toBeInTheDocument()
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      expect(createdTab).toHaveAttribute('aria-selected', 'true')
    })

    it('should switch to History tab when clicked', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument()
      })

      const historyTab = screen.getByRole('tab', { name: /history/i })
      await user.click(historyTab)

      expect(historyTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Filter Bar', () => {
    it('should display type filter dropdown', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        const typeSelect = screen.getByText('Type:').nextElementSibling
        expect(typeSelect).toBeInTheDocument()
        expect(typeSelect.tagName).toBe('SELECT')
      })
    })

    it('should display refresh button', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      })
    })
  })

  describe('Empty States', () => {
    it('should show empty state for Participating tab with no positions', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByText('No Active Positions')).toBeInTheDocument()
      })
    })

    it('should show empty state for Created tab with no markets', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /created/i })).toBeInTheDocument()
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      await waitFor(() => {
        expect(screen.getByText('No Wagers Created')).toBeInTheDocument()
      })
    })

    it('should show empty state for History tab with no resolved markets', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument()
      })

      const historyTab = screen.getByRole('tab', { name: /history/i })
      await user.click(historyTab)

      await waitFor(() => {
        expect(screen.getByText('No Wager History')).toBeInTheDocument()
      })
    })
  })

  describe('Wallet Not Connected', () => {
    it('should show connect wallet message when not connected', async () => {
      useWallet.mockReturnValue({
        isConnected: false,
        account: null
      })

      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        // When not connected, should show the connect wallet message immediately (no loading)
        expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument()
        expect(screen.queryByText('Loading your markets...')).not.toBeInTheDocument()
      })
    })
  })

  describe('With Markets Data', () => {
    const mockMarkets = [
      {
        id: '1',
        description: 'Test Wager 1',
        creator: '0x1234567890123456789012345678901234567890',
        tradingEndTime: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
        status: 'active',
        marketType: 'friend'
      },
      {
        id: '2',
        description: 'Test Wager 2',
        creator: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        participants: ['0x1234567890123456789012345678901234567890'],
        tradingEndTime: BigInt(Math.floor(Date.now() / 1000) + 86400 * 14),
        status: 'active',
        marketType: 'friend'
      }
    ]

    it('should display markets user has created in Created tab', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={mockMarkets} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /created/i })).toBeInTheDocument()
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      await waitFor(() => {
        expect(screen.getByText('Test Wager 1')).toBeInTheDocument()
      })
    })

    it('should display markets user is participating in', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={mockMarkets} />
        )
      })

      await waitFor(() => {
        expect(screen.getByText('Test Wager 2')).toBeInTheDocument()
      })
    })

    it('should hide expired pending offers from the default list', async () => {
      const expiredMarket = {
        id: '99',
        description: 'Expired Offer',
        creator: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        participants: ['0x1234567890123456789012345678901234567890'],
        status: 'pending_acceptance',
        acceptanceDeadline: Date.now() - 60 * 60 * 1000,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        marketType: 'friend'
      }

      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={[expiredMarket]} />
        )
      })

      // Default Participating tab + 'all' status filter → expired offer hidden
      expect(screen.queryByText('Expired Offer')).not.toBeInTheDocument()
      expect(screen.getByText(/No Active Positions/i)).toBeInTheDocument()
    })

    it('shows expired offers with "Expired" time-left and Clear button when filter is Expired', async () => {
      const user = userEvent.setup()
      const dismissMarket = vi.fn()
      const expiredMarket = {
        id: '99',
        description: 'Expired Offer',
        creator: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        participants: ['0x1234567890123456789012345678901234567890'],
        status: 'pending_acceptance',
        acceptanceDeadline: Date.now() - 60 * 60 * 1000,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        marketType: 'friend'
      }

      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={[expiredMarket]} />,
          {
            friendMarketsContext: {
              ...defaultFriendMarketsContext,
              dismissMarket,
            }
          }
        )
      })

      const statusSelect = screen.getAllByRole('combobox')[1]
      await user.selectOptions(statusSelect, 'expired')

      await waitFor(() => {
        expect(screen.getByText('Expired Offer')).toBeInTheDocument()
      })

      // Time-left cell reads "Expired", not "tomorrow"
      expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)

      // Invitee (not creator) → button label is just "Clear"
      const clearBtn = screen.getByRole('button', { name: /^clear$/i })
      await user.click(clearBtn)
      expect(dismissMarket).toHaveBeenCalledWith('99')
    })

    it('should show tab badges only for unread wagers (count circuit breaker)', async () => {
      const { useMyWagerNotifications } = await import('../hooks')
      // Mark wager id '1' (the user-created one) as unread
      useMyWagerNotifications.mockReturnValueOnce({
        unreadCount: 1,
        unreadMarketIds: ['1'],
        markMarketAsRead: vi.fn(),
        isMarketUnread: (id) => String(id) === '1',
      })

      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={mockMarkets} />
        )
      })

      await waitFor(() => {
        const createdTab = screen.getByRole('tab', { name: /created/i })
        expect(within(createdTab).getByText('1')).toBeInTheDocument()
      })
    })
  })

  describe('Keyboard Navigation', () => {
    it('should close modal on Escape key', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await user.keyboard('{Escape}')

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Backdrop Click', () => {
    it('should close modal when backdrop is clicked', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // The backdrop is the element with class 'my-markets-modal-backdrop'
      const backdrop = document.querySelector('.my-markets-modal-backdrop')
      // Click on backdrop directly (not the modal content)
      await user.click(backdrop)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should not close modal when modal content is clicked', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByText('My Wagers')).toBeInTheDocument()
      })

      const title = screen.getByText('My Wagers')
      await user.click(title)

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Friend Markets Integration', () => {
    const mockFriendMarkets = [
      {
        id: 'friend-1',
        description: 'Friend bet on game',
        creator: '0x1234567890123456789012345678901234567890',
        endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        status: 'active',
        stakeAmount: '10',
        participants: ['0x1234567890123456789012345678901234567890', '0xABCDEF1234567890ABCDEF1234567890ABCDEF12']
      }
    ]

    it('should display friend markets in Created tab when user is creator', async () => {
      const user = userEvent.setup()
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal
            isOpen={true}
            onClose={mockOnClose}
            friendMarkets={mockFriendMarkets}
          />
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /created/i })).toBeInTheDocument()
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      await waitFor(() => {
        expect(screen.getByText('Friend bet on game')).toBeInTheDocument()
      })
    })
  })

  describe('Draw resolution (US3)', () => {
    const me = '0x1234567890123456789012345678901234567890'
    const other = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'
    // tradingEndTime in the past (ms) so the resolve window is open and the
    // Resolve button renders (no resolveDeadlineTime → deadline gate skipped).
    const pastEnd = Date.now() - 86_400_000

    it('shows a distinct "Draw" status for a drawn wager in History', async () => {
      const user = userEvent.setup()
      const drawn = {
        id: '7', description: 'Drawn Wager', creator: me, participants: [me, other],
        status: 'draw', marketType: 'friend',
        endDate: new Date(Date.now() - 3_600_000).toISOString(),
      }
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={[drawn]} />
        )
      })

      const historyTab = screen.getByRole('tab', { name: /history/i })
      await user.click(historyTab)

      await waitFor(() => {
        expect(screen.getByText('Drawn Wager')).toBeInTheDocument()
      })
      // The status badge reads "Draw" (distinct text — not "Refunded"/"Resolved").
      expect(screen.getAllByText('Draw').length).toBeGreaterThan(0)
      expect(screen.queryByText('Refunded')).not.toBeInTheDocument()
    })

    it('offers a labeled Draw option in the resolution modal for an authorized resolver', async () => {
      const user = userEvent.setup()
      const active = {
        id: '8', description: 'Either Bet', creator: me, opponent: other,
        participants: [me, other], resolutionType: 0, status: 'active',
        marketType: 'friend', tradingEndTime: pastEnd,
      }
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={[active]} />
        )
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      const resolveBtn = await screen.findByRole('button', { name: /^resolve$/i })
      await user.click(resolveBtn)

      // Modal opens; the Draw option is presented alongside the winner options.
      expect(await screen.findByText(/Draw — both parties refunded/i)).toBeInTheDocument()
      // Winner options are also present for an Either resolver.
      expect(screen.getByText('Creator wins')).toBeInTheDocument()
    })

    it('does not offer a manual Draw for an oracle-resolved (Polymarket) wager', async () => {
      const user = userEvent.setup()
      const oracleWager = {
        id: '9', description: 'Polymarket Bet', creator: me, opponent: other,
        participants: [me, other], resolutionType: 4, status: 'active',
        marketType: 'friend', tradingEndTime: pastEnd,
      }
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} friendMarkets={[oracleWager]} />
        )
      })

      const createdTab = screen.getByRole('tab', { name: /created/i })
      await user.click(createdTab)

      await waitFor(() => {
        expect(screen.getByText('Polymarket Bet')).toBeInTheDocument()
      })
      // Oracle wagers resolve automatically — no manual Resolve/Draw control.
      expect(screen.queryByRole('button', { name: /^resolve$/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/Draw — both parties refunded/i)).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper tab roles', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        const tablist = screen.getByRole('tablist')
        expect(tablist).toBeInTheDocument()

        const tabs = screen.getAllByRole('tab')
        expect(tabs).toHaveLength(3)
      })
    })

    it('should have proper tabpanel role after loading', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      // Wait for loading to complete
      await waitFor(() => {
        const tabpanel = screen.queryByRole('tabpanel')
        expect(tabpanel).toBeInTheDocument()
      })
    })
  })
})
