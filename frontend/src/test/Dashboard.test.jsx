import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../components/fairwins/Dashboard'
import { UserPreferencesContext, WalletContext } from '../contexts'

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
    balance: '0'
  }

  const defaultPreferencesContext = {
    preferences: {
      recentSearches: [],
      favoriteMarkets: [],
      defaultSlippage: 0.5,
      clearPathStatus: { active: false, lastUpdated: null },
      demoMode: true
    },
    isLoading: false,
    addRecentSearch: vi.fn(),
    clearRecentSearches: vi.fn(),
    toggleFavoriteMarket: vi.fn(),
    setDefaultSlippage: vi.fn(),
    setClearPathStatus: vi.fn(),
    setDemoMode: vi.fn(),
    savePreference: vi.fn(),
    clearAllPreferences: vi.fn()
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      walletContext = defaultWalletContext,
      preferencesContext = defaultPreferencesContext
    } = options

    return render(
      <MemoryRouter>
        <WalletContext.Provider value={walletContext}>
          <UserPreferencesContext.Provider value={preferencesContext}>
            {component}
          </UserPreferencesContext.Provider>
        </WalletContext.Provider>
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

    it('should show demo mode badge in demo mode', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Demo Mode')).toBeInTheDocument()
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
      expect(screen.getByText('Auto-resolution')).toBeInTheDocument()
      expect(screen.getByText('Claim winnings')).toBeInTheDocument()
    })
  })

  describe('Active Wagers', () => {
    it('should render active wagers section in demo mode', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Active Wagers')).toBeInTheDocument()
    })

    it('should display demo wager cards', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Will BTC be above $100k by March 2026?')).toBeInTheDocument()
    })

    it('should show wager status badges', () => {
      renderWithProviders(<Dashboard />)
      const activeBadges = screen.getAllByText('Active')
      expect(activeBadges.length).toBeGreaterThan(0)
    })
  })

  describe('Past Wagers', () => {
    it('should render past wagers section when there are resolved wagers', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Past Wagers')).toBeInTheDocument()
    })

    it('should display resolved wager', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('ETH merge anniversary price prediction')).toBeInTheDocument()
    })
  })

  describe('Oracle Info', () => {
    it('should render oracle sources panel', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Oracle Sources')).toBeInTheDocument()
    })

    it('should display all oracle options', () => {
      renderWithProviders(<Dashboard />)
      expect(screen.getByText('Peg wagers to Polymarket event outcomes')).toBeInTheDocument()
      expect(screen.getByText('Price feed-based resolution')).toBeInTheDocument()
      expect(screen.getByText('Custom truth assertions')).toBeInTheDocument()
      expect(screen.getByText('Creator-resolved with challenge period')).toBeInTheDocument()
    })
  })

  describe('Not Connected State', () => {
    it('should show connect prompt when not connected and not demo mode', () => {
      renderWithProviders(<Dashboard />, {
        walletContext: { ...defaultWalletContext, isConnected: false, account: null },
        preferencesContext: {
          ...defaultPreferencesContext,
          preferences: { ...defaultPreferencesContext.preferences, demoMode: false }
        }
      })
      expect(screen.getByText('Connect your wallet to create and manage wagers')).toBeInTheDocument()
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
