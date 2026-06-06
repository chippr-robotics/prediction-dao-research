import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// import { axe } from 'vitest-axe' // Unused, commented out for now
import WalletButton from '../components/wallet/WalletButton'
import { WalletContext, ThemeContext, ROLES, ROLE_INFO, UIContext, UserPreferencesContext, FriendMarketsContext } from '../contexts'
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
}))

vi.mock('../hooks/useDex', () => ({
  useDex: vi.fn(() => ({
    balances: { usc: '100.00' },
    loading: false
  }))
}))

vi.mock('../hooks/useUserPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    preferences: {}
  }))
}))

vi.mock('../hooks/useNetworkMode', () => ({
  useNetworkMode: vi.fn(() => ({
    mode: 'testnet',
    isMainnet: false,
    isTestnet: true,
    isOtherChain: false,
    network: { chainId: 80002, name: 'Polygon Amoy' },
    chainId: 80002,
    switchMode: vi.fn(),
    isSwitching: false,
    error: null,
  })),
}))

// FriendMarketsModal / MyMarketsModal are no longer mounted by WalletButton
// (wager creation/management moved to the Dashboard), so no mocks are needed.

vi.mock('../components/ui/PremiumPurchaseModal', () => ({
  default: ({ onClose }) => (
    <div role="dialog" aria-label="Premium Purchase Modal"><button onClick={onClose}>Close</button></div>
  )
}))

import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useWalletRoles, useWeb3 } from '../hooks'
import { useDex } from '../hooks/useDex'
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

  const defaultFriendMarketsContext = {
    friendMarkets: [],
    loading: false,
    refresh: vi.fn(),
    addMarket: vi.fn(),
    setFriendMarkets: vi.fn()
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      uiContext = defaultUIContext,
      themeContext = defaultThemeContext,
      walletContext = defaultWalletContext,
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
    useDex.mockReturnValue({
      balances: { usc: '100.00' },
      loading: false
    })
    useUserPreferences.mockReturnValue({
      preferences: {}
    })
  })

  describe('Unified Wagers Section', () => {
    it('displays the Wagers upsell section for non-members', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })
      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Wagers')).toBeInTheDocument()
      })
    })

    it('does not show "Create Wager" or "My Wagers" for members (moved to the Dashboard)', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.WAGER_PARTICIPANT],
        hasRole: vi.fn((role) => role === ROLES.WAGER_PARTICIPANT)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      // Dropdown is open…
      await screen.findByRole('menu')
      // …but the wager entries are gone, and for a member the Wagers section is hidden.
      expect(screen.queryByText('Create Wager')).not.toBeInTheDocument()
      expect(screen.queryByText('My Wagers')).not.toBeInTheDocument()
      expect(screen.queryByText('Wagers')).not.toBeInTheDocument()
    })

    it('shows purchase access prompt for users without WAGER_PARTICIPANT role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText(/Get Access - from \$2 USDC \/ month/)).toBeInTheDocument()
      })
    })

    it('no longer shows the "My Wagers" entry in the dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await screen.findByRole('menu')
      expect(screen.queryByText('My Wagers')).not.toBeInTheDocument()
    })

    it('hides Create Prediction Market button (removed feature)', async () => {
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

})
