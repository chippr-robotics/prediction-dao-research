import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../components/fairwins/Dashboard'
import { UserPreferencesContext, WalletContext, FriendMarketsContext, UIContext, DexContext } from '../contexts'

// Stub the create modal to record the props each QuickActions card opens it with,
// so we can assert the button → flow wiring (participant / oracle / all) without
// rendering the heavy modal internals.
vi.mock('../components/fairwins/FriendMarketsModal', () => ({
  default: ({ isOpen, initialType, resolutionCategory }) => isOpen ? (
    <div
      data-testid="friend-modal"
      data-initial-type={initialType}
      data-resolution-category={resolutionCategory}
    />
  ) : null,
}))

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

  describe('QuickActions button flows', () => {
    const openVia = (cardText) => {
      renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText(cardText))
      return screen.getByTestId('friend-modal')
    }

    it('"Friends Decide (1v1)" opens the participant flow', () => {
      const modal = openVia('Friends Decide (1v1)')
      expect(modal).toHaveAttribute('data-initial-type', 'oneVsOne')
      expect(modal).toHaveAttribute('data-resolution-category', 'participant')
    })

    it('"Oracle Settles (1v1)" opens the oracle flow (lands on Polymarket search)', () => {
      const modal = openVia('Oracle Settles (1v1)')
      expect(modal).toHaveAttribute('data-initial-type', 'oneVsOne')
      expect(modal).toHaveAttribute('data-resolution-category', 'oracle')
    })

    it('"Make an Offer" opens the all-resolution flow', () => {
      const modal = openVia('Make an Offer')
      expect(modal).toHaveAttribute('data-initial-type', 'offer')
      expect(modal).toHaveAttribute('data-resolution-category', 'all')
    })

    it('the create modal is closed until a card is clicked', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByTestId('friend-modal')).not.toBeInTheDocument()
    })

    // Spec 011 follow-up: Share Account quick action surfaces the address QR
    // modal (AddressQRModal, contracts M1–M10) in its QUICK variant — a
    // clean, minimally branded QR using the persisted color choice, with no
    // color options and no visible address text.
    it('"Share Account" opens the quick QR view for the connected address', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Share Account'))

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      // QR rendered for the exact connected address (account alias of
      // address) — asserted via the contracted accessible name (A1), which
      // embeds the shortened connected address.
      expect(
        screen.getByRole('img', { name: /qr code for your wallet address 0x1234/i })
      ).toBeInTheDocument()
      // Quick variant: no color options, no visible address text.
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(
        screen.queryByText(defaultWalletContext.account)
      ).not.toBeInTheDocument()
    })

    it('"Share Account" QR uses the color preference saved on the Account page', () => {
      localStorage.setItem('fairwins_qrcolor_v1', 'forest')
      const { container } = renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText('Share Account'))

      const html = container.querySelector('.address-qr svg').outerHTML.toUpperCase()
      expect(html).toContain('#14532D')
      localStorage.removeItem('fairwins_qrcolor_v1')
    })

    it('"Share Account" modal closes via its close button', () => {
      renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText('Share Account'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: /close address qr dialog/i })
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
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
      expect(screen.getByText('Friends Decide (1v1)')).toBeInTheDocument()
      expect(screen.getByText('Oracle Settles (1v1)')).toBeInTheDocument()
      expect(screen.getByText('Make an Offer')).toBeInTheDocument()
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument()
      expect(screen.getByText('Share Account')).toBeInTheDocument()
      expect(screen.getByText('My Wagers')).toBeInTheDocument()
    })

    it('should have quick action descriptions', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('You and a friend settle the outcome')).toBeInTheDocument()
      // Default (VITE_ORACLE_MODELS=polymarket-only) hides Chainlink/UMA copy.
      expect(screen.getByText('Auto-settles from a linked Polymarket market')).toBeInTheDocument()
      expect(screen.queryByText(/Chainlink or UMA/)).not.toBeInTheDocument()
      expect(screen.getByText('Offer odds and choose who settles — you or your friend')).toBeInTheDocument()
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
