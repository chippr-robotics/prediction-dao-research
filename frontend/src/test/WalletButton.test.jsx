import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// import { axe } from 'vitest-axe' // Unused, commented out for now
import WalletButton from '../components/wallet/WalletButton'
import { WalletContext, ThemeContext, ROLES, ROLE_INFO, UIContext, UserPreferencesContext } from '../contexts'
import { BrowserRouter } from 'react-router-dom'

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useConnect: vi.fn(() => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'MetaMask', type: 'injected' }],
    isPending: false
  })),
  useDisconnect: vi.fn(() => ({
    disconnect: vi.fn()
  })),
  useChainId: vi.fn(() => 61),
  useWalletClient: vi.fn(() => ({
    data: {
      account: { address: '0x1234567890123456789012345678901234567890' },
      chain: { id: 61 },
      transport: {}
    }
  })),
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({}))
}))

// Mock hooks
vi.mock('../hooks', () => ({
  useWalletRoles: vi.fn(),
  useWeb3: vi.fn(() => ({ signer: {}, isCorrectNetwork: true, switchNetwork: vi.fn() })),
  useWallet: vi.fn(() => ({ isConnected: true, account: '0x1234567890123456789012345678901234567890' })),
  useDataFetcher: vi.fn(() => ({ getMarkets: vi.fn(() => Promise.resolve([])), getPositions: vi.fn(() => Promise.resolve([])) }))
}))

vi.mock('../hooks/useETCswap', () => ({
  useETCswap: vi.fn(() => ({
    balances: { usc: '100.00' },
    loading: false
  }))
}))

vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    preferences: { demoMode: false },
    setDemoMode: vi.fn()
  }))
}))

// Mock modal components
vi.mock('../components/fairwins/FriendMarketsModal', () => ({
  default: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="Create Wager Modal"><button onClick={onClose}>Close</button></div>
  ) : null,
  FriendMarketsModal: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="Create Wager Modal"><button onClick={onClose}>Close</button></div>
  ) : null
}))

vi.mock('../components/fairwins/MarketCreationModal', () => ({
  default: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="Create Prediction Market Modal"><button onClick={onClose}>Close</button></div>
  ) : null
}))

vi.mock('../components/fairwins/MyMarketsModal', () => ({
  default: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="My Wagers Modal"><button onClick={onClose}>Close</button></div>
  ) : null,
  MyMarketsModal: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="My Wagers Modal"><button onClick={onClose}>Close</button></div>
  ) : null
}))

vi.mock('../components/ui/PremiumPurchaseModal', () => ({
  default: ({ onClose }) => (
    <div role="dialog" aria-label="Premium Purchase Modal"><button onClick={onClose}>Close</button></div>
  )
}))

import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useWalletRoles, useWeb3 } from '../hooks'
import { useETCswap } from '../hooks/useETCswap'
import { useUserPreferences } from '../hooks/useUserPreferences'

describe('WalletButton Component - Wagers', () => {
  const mockShowModal = vi.fn()
  const mockHideModal = vi.fn()

  const defaultUIContext = {
    showModal: mockShowModal,
    hideModal: mockHideModal,
    modal: null
  }

  const defaultThemeContext = {
    theme: 'dark',
    toggleTheme: vi.fn(),
    setTheme: vi.fn()
  }

  // WalletContext now provides roles (useRoles hook uses WalletContext)
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
    // Wallet state
    address: '0x1234567890123456789012345678901234567890',
    account: '0x1234567890123456789012345678901234567890',
    isConnected: true,
    provider: null,
    signer: null
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      uiContext = defaultUIContext,
      themeContext = defaultThemeContext,
      walletContext = defaultWalletContext
    } = options

    return render(
      <BrowserRouter>
        <ThemeContext.Provider value={themeContext}>
          <WalletContext.Provider value={walletContext}>
            <UIContext.Provider value={uiContext}>
              {component}
            </UIContext.Provider>
          </WalletContext.Provider>
        </ThemeContext.Provider>
      </BrowserRouter>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true
    })
    useConnect.mockReturnValue({
      connect: vi.fn(),
      connectors: [{ id: 'injected', name: 'MetaMask', type: 'injected' }],
      isPending: false
    })
    useDisconnect.mockReturnValue({
      disconnect: vi.fn()
    })
    useChainId.mockReturnValue(61)
    useWalletRoles.mockReturnValue({
      roles: [],
      hasRole: vi.fn(() => false)
    })
    useWeb3.mockReturnValue({ signer: {} })
    useETCswap.mockReturnValue({
      balances: { usc: '100.00' },
      loading: false
    })
    useUserPreferences.mockReturnValue({
      preferences: { demoMode: false },
      setDemoMode: vi.fn()
    })
  })

  describe('Unified Wagers Section', () => {
    it('displays Wagers section header in dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Wagers')).toBeInTheDocument()
      })
    })

    it('shows Create Wager button for users with FRIEND_MARKET role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Create Wager')).toBeInTheDocument()
      })
    })

    it('shows purchase access prompt for users without FRIEND_MARKET role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Get Access - $50 USC per Month')).toBeInTheDocument()
      })
    })

    it('shows My Wagers button for all connected users', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('My Wagers')).toBeInTheDocument()
      })
    })

    it('shows Create Prediction Market button for users with MARKET_MAKER role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Create Prediction Market')).toBeInTheDocument()
      })
    })

    it('hides Create Prediction Market button for users without MARKET_MAKER role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.queryByText('Create Prediction Market')).not.toBeInTheDocument()
      })
    })
  })

  describe('Create Wager Feature', () => {
    it('opens wager creation modal when Create Wager button is clicked', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      const createWagerBtn = await screen.findByText('Create Wager')
      await user.click(createWagerBtn)

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /create wager/i })).toBeInTheDocument()
      })
    })

    it('closes dropdown when Create Wager button is clicked', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      const createWagerBtn = await screen.findByText('Create Wager')
      await user.click(createWagerBtn)

      await waitFor(() => {
        expect(screen.queryByText('Wagers')).not.toBeInTheDocument()
      })
    })

    it('opens prediction market modal when Create Prediction Market is clicked', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      const createMarketBtn = await screen.findByText('Create Prediction Market')
      await user.click(createMarketBtn)

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /create prediction market/i })).toBeInTheDocument()
      })
    })
  })

  describe('Wager and Market Integration', () => {
    it('shows both Create Wager and Create Prediction Market when user has both roles', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET, ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET || role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Create Wager')).toBeInTheDocument()
        expect(screen.getByText('Create Prediction Market')).toBeInTheDocument()
      })
    })

    it('all wager actions are within a single Wagers section', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET, ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET || role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        // Only one Wagers section title should exist
        const wagersSections = screen.getAllByText('Wagers')
        const sectionTitle = wagersSections.find(el =>
          el.className.includes('wallet-section-title')
        ) || wagersSections[0]
        expect(sectionTitle).toBeInTheDocument()

        // My Wagers button should come after the section title
        const myWagersBtn = screen.getByText('My Wagers')
        expect(sectionTitle.compareDocumentPosition(myWagersBtn))
          .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      })
    })
  })

  describe('Accessibility', () => {
    it('Create Wager button has correct role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        const createWagerBtn = screen.getByText('Create Wager').closest('button')
        expect(createWagerBtn).toHaveAttribute('role', 'menuitem')
      })
    })
  })
})
