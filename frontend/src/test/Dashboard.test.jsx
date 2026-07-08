import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../components/fairwins/Dashboard'
import { UserPreferencesContext, WalletContext, FriendMarketsContext, UIContext, DexContext } from '../contexts'
import { setCardVisible } from '../utils/quickAccessPreference'

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

// Stub the unified phrase lookup (spec 037) so we assert the Dashboard wiring — the "Enter a Phrase"
// quick action and the ?oc=take&code= deep-link reroute — without its resolver/hook internals.
// Stub the oracle open challenge modal (spec 041) to assert the Dashboard card wiring
// without the picker/create internals (covered by OracleOpenChallengeModal.test.jsx).
vi.mock('../components/fairwins/OracleOpenChallengeModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="oracle-open-challenge-modal" /> : null,
}))

vi.mock('../components/fairwins/UnifiedLookupModal', () => ({
  default: ({ isOpen, initialPhrase, autoResolve }) => isOpen ? (
    <div data-testid="unified-modal" data-phrase={initialPhrase} data-auto={String(autoResolve)} />
  ) : null,
}))

vi.mock('../components/fairwins/PolymarketTickerCrawler', () => ({
  default: ({ onSelectMarket }) => (
    <button type="button" onClick={() => onSelectMarket?.()}>
      Ticker: Will event happen?
    </button>
  ),
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
    localStorage.removeItem('fairwins_quickaccess_v1')
  })

  describe('QuickActions button flows', () => {
    const openVia = (cardText, cardId) => {
      setCardVisible(cardId, true)
      renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText(cardText))
      return screen.getByTestId('friend-modal')
    }

    it('"Friends Decide (1v1)" opens the participant flow', () => {
      const modal = openVia('Friends Decide (1v1)', 'create-1v1-friends')
      expect(modal).toHaveAttribute('data-initial-type', 'oneVsOne')
      expect(modal).toHaveAttribute('data-resolution-category', 'participant')
    })

    it('"Oracle Settles (1v1)" opens the oracle flow (lands on Polymarket search)', () => {
      const modal = openVia('Oracle Settles (1v1)', 'create-1v1-oracle')
      expect(modal).toHaveAttribute('data-initial-type', 'oneVsOne')
      expect(modal).toHaveAttribute('data-resolution-category', 'oracle')
    })

    it('"Make an Offer" opens the all-resolution flow', () => {
      const modal = openVia('Make an Offer', 'create-offer')
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
      setCardVisible('share-account', true)
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
      setCardVisible('share-account', true)
      localStorage.setItem('fairwins_qrcolor_v1', 'forest')
      const { container } = renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText('Share Account'))

      const html = container.querySelector('.address-qr svg').outerHTML.toUpperCase()
      expect(html).toContain('#14532D')
      localStorage.removeItem('fairwins_qrcolor_v1')
    })

    it('"Share Account" modal closes via its close button', () => {
      setCardVisible('share-account', true)
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
      expect(screen.getByText('Quick Actions')).toBeInTheDocument()
    })

    it('should not show the demo mode badge by default', () => {
      // The demo badge only renders when VITE_USE_MOCK_WAGERS=true (a dev-only
      // env var). In production tests the toggle is gone, so the badge should
      // be absent.
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText('Demo Mode')).not.toBeInTheDocument()
    })

    it('should not show redundant connected wallet subtitle', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument()
    })
  })

  describe('Quick Actions', () => {
    it('shows only the default-visible quick action cards', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Open Oracle Challenge')).toBeInTheDocument()
      expect(screen.getByText('Enter Words')).toBeInTheDocument()
      expect(screen.getByText('My Wagers')).toBeInTheDocument()
      expect(screen.queryByText('Friends Decide (1v1)')).not.toBeInTheDocument()
      expect(screen.queryByText('Oracle Settles (1v1)')).not.toBeInTheDocument()
      expect(screen.queryByText('Make an Offer')).not.toBeInTheDocument()
      expect(screen.queryByText('Open Challenge')).not.toBeInTheDocument()
      expect(screen.queryByText('Group Pool')).not.toBeInTheDocument()
      expect(screen.queryByText('Scan QR Code')).not.toBeInTheDocument()
      expect(screen.queryByText('Share Account')).not.toBeInTheDocument()
    })

    it('should have quick action descriptions', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText(/share a code — Polymarket settles it automatically/i)).toBeInTheDocument()
      expect(screen.getByText('Enter four words to join a pool or take a challenge')).toBeInTheDocument()
      expect(screen.getByText('View active and past wagers')).toBeInTheDocument()
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

  describe('Unified phrase lookup entry (spec 037)', () => {
    const providers = (children, initialEntries) => (
      <MemoryRouter initialEntries={initialEntries}>
        <UIContext.Provider value={defaultUIContext}>
          <WalletContext.Provider value={defaultWalletContext}>
            <UserPreferencesContext.Provider value={defaultPreferencesContext}>
              <FriendMarketsContext.Provider value={defaultFriendMarketsContext}>
                <DexContext.Provider value={defaultDexContext}>
                  {children}
                </DexContext.Provider>
              </FriendMarketsContext.Provider>
            </UserPreferencesContext.Provider>
          </WalletContext.Provider>
        </UIContext.Provider>
      </MemoryRouter>
    )

    it('the "Enter a Phrase" quick action opens the unified lookup (no auto-resolve)', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByTestId('unified-modal')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Enter Words'))
      const modal = screen.getByTestId('unified-modal')
      expect(modal).toHaveAttribute('data-auto', 'false')
      expect(modal).toHaveAttribute('data-phrase', '')
    })

    it('a ?oc=take&code= deep link opens the unified lookup prefilled and auto-resolving (FR-013)', () => {
      render(providers(<Dashboard />, ['/app?oc=take&code=river%20tiger%20kite%20zoo']))
      const modal = screen.getByTestId('unified-modal')
      expect(modal).toHaveAttribute('data-phrase', 'river tiger kite zoo')
      expect(modal).toHaveAttribute('data-auto', 'true')
    })
  })

  describe('Quick access card visibility (spec 038 US5)', () => {
    afterEach(() => {
      localStorage.removeItem('fairwins_quickaccess_v1')
    })

    it('hides a card that has been turned off in Preferences and reflows the rest', () => {
      setCardVisible('share-account', true)
      setCardVisible('scan-qr', false)
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText('Scan QR Code')).not.toBeInTheDocument()
      // The rest of the grid is unaffected.
      expect(screen.getByText('Share Account')).toBeInTheDocument()
    })

    it('a card left visible (the default) still renders', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('My Wagers')).toBeInTheDocument()
    })

    it('shows a recoverable empty state pointing at Preferences when every card is hidden', () => {
      const allCardIds = [
        'create-1v1-friends', 'create-1v1-oracle', 'create-offer', 'open-challenge',
        'oracle-open-challenge', 'create-pool',
        'enter-phrase', 'my-wagers', 'scan-qr', 'share-account',
      ]
      allCardIds.forEach((id) => setCardVisible(id, false))
      renderWithProviders(<Dashboard />)
      expect(screen.getByText(/all quick access cards are hidden/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /open preferences/i })).toBeInTheDocument()
      expect(screen.queryByText('Friends Decide (1v1)')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(<Dashboard />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('Quick Actions')
    })

    it('should have accessible quick action buttons', () => {
      renderWithProviders(<Dashboard />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should not render the legacy how-it-works section', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText('How P2P Wagers Work')).not.toBeInTheDocument()
    })
  })

  describe('Oracle Open Challenge entry (spec 041)', () => {
    it('renders the card with its oracle-settles description', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Open Oracle Challenge')).toBeInTheDocument()
      expect(screen.getByText(/share a code — Polymarket settles it automatically/i)).toBeInTheDocument()
    })

    it('clicking the card opens the oracle open challenge modal (not the 1v1 flow)', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByTestId('oracle-open-challenge-modal')).toBeNull()
      fireEvent.click(screen.getByText('Open Oracle Challenge'))
      expect(screen.getByTestId('oracle-open-challenge-modal')).toBeInTheDocument()
      expect(screen.queryByTestId('friend-modal')).toBeNull()
    })

    it('clicking a ticker title opens the oracle open challenge modal', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.queryByTestId('oracle-open-challenge-modal')).toBeNull()
      fireEvent.click(screen.getByText('Ticker: Will event happen?'))
      expect(screen.getByTestId('oracle-open-challenge-modal')).toBeInTheDocument()
    })

    it('the card is toggleable via quick-access preferences like any other (spec 038 US5)', () => {
      setCardVisible('oracle-open-challenge', false)
      renderWithProviders(<Dashboard />)
      expect(screen.queryByText('Open Oracle Challenge')).toBeNull()
      setCardVisible('oracle-open-challenge', true)
    })

    it('the user-defined Open Challenge card still opens its own modal unchanged (FR-018)', () => {
      setCardVisible('open-challenge', true)
      renderWithProviders(<Dashboard />)
      fireEvent.click(screen.getByText('Open Challenge'))
      // The user-defined modal renders its own dialog header (not the oracle stub);
      // the card itself is an h4, the modal title an h2.
      expect(screen.queryByTestId('oracle-open-challenge-modal')).toBeNull()
      expect(screen.getByRole('heading', { level: 2, name: 'Open Challenge' })).toBeInTheDocument()
    })
  })
})
