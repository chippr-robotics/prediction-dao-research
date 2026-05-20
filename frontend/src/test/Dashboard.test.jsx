import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../components/fairwins/Dashboard'
import { UserPreferencesContext, WalletContext, FriendMarketsContext, UIContext, DexContext } from '../contexts'

describe('Dashboard Component', () => {
  const defaultWalletContext = {
    account: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
    provider: null,
    signer: null,
    chainId: 63,
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    switchNetwork: vi.fn(),
    isCorrectNetwork: true,
    networkError: null,
    isConnecting: false,
    balance: '0',
    roles: [],
    rolesLoading: false,
    blockchainSynced: true,
    refreshRoles: vi.fn(),
    hasRole: vi.fn().mockReturnValue(false),
    hasAnyRole: vi.fn().mockReturnValue(false),
    hasAllRoles: vi.fn().mockReturnValue(false),
    grantRole: vi.fn(),
    revokeRole: vi.fn()
  }

  const defaultUIContext = {
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

  const defaultPreferencesContext = {
    preferences: {
      recentSearches: [],
      favoriteMarkets: [],
      defaultSlippage: 0.5,
    },
    isLoading: false,
    addRecentSearch: vi.fn(),
    clearRecentSearches: vi.fn(),
    toggleFavoriteMarket: vi.fn(),
    setDefaultSlippage: vi.fn(),
    savePreference: vi.fn(),
    clearAllPreferences: vi.fn()
  }

  const defaultFriendMarketsContext = {
    friendMarkets: [],
    loading: false,
    refresh: vi.fn(),
    addMarket: vi.fn(),
    setFriendMarkets: vi.fn()
  }

  // Minimal DexContext stub so child modals that call useDex() (e.g.
  // FriendMarketsModal for chain-aware stake-token options) don't throw
  // when Dashboard mounts them with isOpen=false.
  const defaultDexContext = {
    balances: { native: '0', wnative: '0', stable: '0' },
    balanceHistory: [],
    loading: false,
    quotingPrice: false,
    slippage: 50,
    fetchBalances: vi.fn(),
    wrapNative: vi.fn(),
    unwrapNative: vi.fn(),
    getQuote: vi.fn(),
    swap: vi.fn(),
    setSlippage: vi.fn(),
    tokens: {
      WNATIVE: { address: '0x0', symbol: 'WMATIC', name: 'Wrapped MATIC', decimals: 18, icon: '🌐' },
      STABLE: { address: '0x0', symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '💵' },
      NATIVE: { address: 'native', symbol: 'MATIC', name: 'MATIC', decimals: 18, icon: '💎' },
    },
    addresses: {
      FACTORY: '0x0', SWAP_ROUTER_02: '0x0', NONFUNGIBLE_TOKEN_POSITION_MANAGER: '0x0',
      QUOTER_V2: '0x0', PERMIT2: '0x0', WNATIVE: '0x0', STABLECOIN: '0x0',
    },
    isDexAvailable: false,
    chainId: 80002,
    network: { chainId: 80002, name: 'Polygon Amoy' },
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      walletContext = defaultWalletContext,
      preferencesContext = defaultPreferencesContext,
      friendMarketsContext = defaultFriendMarketsContext,
      uiContext = defaultUIContext,
      dexContext = defaultDexContext
    } = options

    return render(
      <MemoryRouter>
        <UIContext.Provider value={uiContext}>
          <WalletContext.Provider value={walletContext}>
            <UserPreferencesContext.Provider value={preferencesContext}>
              <FriendMarketsContext.Provider value={friendMarketsContext}>
                <DexContext.Provider value={dexContext}>
                  {component}
                </DexContext.Provider>
              </FriendMarketsContext.Provider>
            </UserPreferencesContext.Provider>
          </WalletContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render dashboard header', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Your Wagers')).toBeInTheDocument()
    })

    it('should not show the demo mode badge by default', () => {
      // The demo badge only renders when VITE_USE_MOCK_WAGERS=true (a dev-only
      // env var). In production tests the toggle is gone, so the badge should
      // be absent.
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText('Demo Mode')).not.toBeInTheDocument()
    })

    it('should show connected wallet address', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText(/Connected: 0x1234\.\.\.5678/)).toBeInTheDocument()
    })
  })

  describe('Quick Actions', () => {
    it('should render all quick action cards', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('New 1v1 Wager')).toBeInTheDocument()
      expect(screen.getByText('Group Wager')).toBeInTheDocument()
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument()
      expect(screen.getByText('My Wagers')).toBeInTheDocument()
    })

    it('should have quick action descriptions', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Challenge a friend to a direct bet')).toBeInTheDocument()
      expect(screen.getByText('Create a pool for 3-10 friends')).toBeInTheDocument()
    })
  })

  describe('How It Works', () => {
    it('should render collapsible how-it-works section', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('How P2P Wagers Work')).toBeInTheDocument()
    })

    it('should expand how-it-works when clicked', () => {
      renderWithProviders(<Dashboard />)
      const toggle = screen.getByText('How P2P Wagers Work')
      fireEvent.click(toggle)
      expect(screen.getByText('Create a wager')).toBeInTheDocument()
      expect(screen.getByText('Share the invite')).toBeInTheDocument()
      expect(screen.getByText('The designated party proposes the outcome. A 24-hour challenge window ensures fairness.')).toBeInTheDocument()
      expect(screen.getByText('Claim winnings')).toBeInTheDocument()
    })
  })

  describe('Active Wagers', () => {
    // Live wagers come from FriendMarketsContext now (mock demoMode was
    // replaced by VITE_USE_MOCK_WAGERS). Tests inject sample wagers through
    // the context so the Dashboard's transform → liveWagers path is exercised.
    const sampleFriendMarkets = [
      {
        id: 1,
        description: 'Will BTC be above $100k by March 2026?',
        status: 'active',
        stakeAmount: '50',
        stakeTokenSymbol: 'USDC',
        type: 'oneVsOne',
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        participants: ['0x1111', '0x2222'],
        creator: '0x1234567890abcdef1234567890abcdef12345678'
      },
      {
        id: 2,
        description: 'Super Bowl LX winner?',
        status: 'active',
        stakeAmount: '25',
        stakeTokenSymbol: 'USDC',
        type: 'oneVsOne',
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        participants: ['0x1111', '0x2222'],
        creator: '0x1234567890abcdef1234567890abcdef12345678'
      }
    ]

    it('should render active wagers section', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Active Wagers')).toBeInTheDocument()
    })

    it('should display live wager cards from FriendMarketsContext', () => {
      renderWithProviders(<Dashboard />, {
        friendMarketsContext: { ...defaultFriendMarketsContext, friendMarkets: sampleFriendMarkets }
      })
      expect(screen.getByText('Will BTC be above $100k by March 2026?')).toBeInTheDocument()
    })

    it('should show wager status badges', () => {
      renderWithProviders(<Dashboard />, {
        friendMarketsContext: { ...defaultFriendMarketsContext, friendMarkets: sampleFriendMarkets }
      })
      const activeBadges = screen.getAllByText('Active')
      expect(activeBadges.length).toBeGreaterThan(0)
    })
  })

  describe('Past Wagers', () => {
    const resolvedFriendMarkets = [
      {
        id: 4,
        description: 'ETH merge anniversary price prediction',
        status: 'resolved',
        stakeAmount: '100',
        stakeTokenSymbol: 'USDC',
        type: 'oneVsOne',
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        participants: ['0x1111', '0x2222'],
        creator: '0x1234567890abcdef1234567890abcdef12345678'
      }
    ]

    it('should render past wagers section when there are resolved wagers', () => {
      renderWithProviders(<Dashboard />, {
        friendMarketsContext: { ...defaultFriendMarketsContext, friendMarkets: resolvedFriendMarkets }
      })
      expect(screen.getByText('Past Wagers')).toBeInTheDocument()
    })

    it('should display resolved wager', () => {
      renderWithProviders(<Dashboard />, {
        friendMarketsContext: { ...defaultFriendMarketsContext, friendMarkets: resolvedFriendMarkets }
      })
      expect(screen.getByText('ETH merge anniversary price prediction')).toBeInTheDocument()
    })
  })

  describe('Not Connected State', () => {
    it('should show welcome view when not connected', () => {
      renderWithProviders(<Dashboard />, {
        walletContext: { ...defaultWalletContext, isConnected: false, account: null, connectWallet: vi.fn() },
      })
      expect(screen.getByText('Create a wagerwith a friend')).toBeInTheDocument()
      expect(screen.getByText('How it works')).toBeInTheDocument()
      expect(screen.getByText('Resolution methods')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(<Dashboard />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('Your Wagers')
    })

    it('should have accessible quick action buttons', () => {
      renderWithProviders(<Dashboard />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should have aria-expanded on how-it-works toggle', () => {
      renderWithProviders(<Dashboard />)
      const toggle = screen.getByRole('button', { name: /How P2P Wagers Work/i })
        || screen.getByText('How P2P Wagers Work').closest('button')
      expect(toggle).toHaveAttribute('aria-expanded')
    })
  })
})
