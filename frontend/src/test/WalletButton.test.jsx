import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// import { axe } from 'vitest-axe' // Unused, commented out for now
import WalletButton from '../components/wallet/WalletButton'
import { WalletContext, ThemeContext, ROLES, ROLE_INFO, UIContext, UserPreferencesContext, FriendMarketsContext } from '../contexts'
import { CustodyContext } from '../contexts/CustodyContext'
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

vi.mock('../components/ui/AddressQRModal', () => ({
  default: ({ isOpen, onClose, address, variant }) => (
    isOpen
      ? (
        <div role="dialog" aria-label="Address QR Modal" data-variant={variant} data-address={address}>
          <button onClick={onClose}>Close</button>
        </div>
      )
      : null
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

    it('exposes a Purchase Membership entry that opens the purchase modal', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })

      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      // The former "Membership Vouchers" action is now "Purchase Membership".
      await waitFor(() => {
        expect(screen.getByText('Purchase Membership')).toBeInTheDocument()
      })
      expect(screen.queryByText('Membership Vouchers')).not.toBeInTheDocument()

      // Non-members also get a direct redeem entry point in the upsell (assert
      // before clicking Purchase, which closes the dropdown).
      expect(screen.getByText(/Have a voucher\? Redeem it/)).toBeInTheDocument()

      // Clicking Purchase Membership opens the purchase modal (mocked here).
      await user.click(screen.getByText('Purchase Membership'))
      expect(mockShowModal).toHaveBeenCalled()
    })

    it('shows Membership (not Purchase Membership) for members, and vice versa', async () => {
      const user = userEvent.setup()

      // Member: manage-membership entry only, no purchase upsell action.
      useWalletRoles.mockReturnValue({
        roles: [ROLES.WAGER_PARTICIPANT],
        hasRole: vi.fn((role) => role === ROLES.WAGER_PARTICIPANT)
      })
      const { unmount } = renderWithProviders(<WalletButton />)
      await user.click(screen.getByRole('button', { name: /wallet account/i }))
      await screen.findByRole('menu')
      expect(screen.getByText('Membership')).toBeInTheDocument()
      expect(screen.queryByText('Purchase Membership')).not.toBeInTheDocument()
      unmount()

      // Non-member: purchase upsell only, no manage-membership entry.
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })
      renderWithProviders(<WalletButton />)
      await user.click(screen.getByRole('button', { name: /wallet account/i }))
      await screen.findByRole('menu')
      expect(screen.getByText('Purchase Membership')).toBeInTheDocument()
      expect(screen.queryByText('Membership')).not.toBeInTheDocument()
    })

    it('no longer shows the Get USDC action in the dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await screen.findByRole('menu')
      expect(screen.queryByText('Get USDC')).not.toBeInTheDocument()
      // Personal-account entries moved onto the account button.
      expect(screen.getByText('Account')).toBeInTheDocument()
      expect(screen.getByText('Preferences')).toBeInTheDocument()
    })

    it('copies the wallet address from the account dropdown header', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      await user.click(screen.getByRole('button', { name: /wallet account/i }))

      const copyButton = await screen.findByRole('button', { name: /copy account address/i })
      await user.click(copyButton)

      // Visible confirmation, and the full address landed on the clipboard
      // (userEvent installs its own functional clipboard stub).
      expect(await screen.findByText('Copied!')).toBeInTheDocument()
      expect(await navigator.clipboard.readText()).toBe(
        '0x1234567890123456789012345678901234567890'
      )
    })

    it('reflects the ACTING account (not the connected passkey) in the header identity + QR', async () => {
      const user = userEvent.setup()
      const ACTING = '0x5250000000000000000000000000000000000abc'
      renderWithProviders(
        <CustodyContext.Provider value={{ active: { mode: 'legacy', address: ACTING, label: 'Recovered' } }}>
          <WalletButton />
        </CustodyContext.Provider>,
      )
      await user.click(screen.getByRole('button', { name: /wallet account/i }))

      // Copy targets the acting account's address, and its type tag is shown.
      const copyBtn = await screen.findByRole('button', { name: /copy account address/i })
      expect(copyBtn).toHaveAttribute('title', ACTING)
      expect(screen.getByText('Recovered')).toBeInTheDocument()

      // The QR shows the acting account's address, not the connected wallet.
      await user.click(screen.getByRole('button', { name: /show wallet address qr code/i }))
      const qrModal = await screen.findByRole('dialog', { name: /address qr modal/i })
      expect(qrModal).toHaveAttribute('data-address', ACTING)
    })

    it('opens the address QR modal from the dropdown header and closes the dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(<WalletButton />)

      await user.click(screen.getByRole('button', { name: /wallet account/i }))
      await screen.findByRole('menu')

      const qrButton = screen.getByRole('button', { name: /show wallet address qr code/i })
      await user.click(qrButton)

      const qrModal = await screen.findByRole('dialog', { name: /address qr modal/i })
      expect(qrModal).toHaveAttribute('data-variant', 'quick')
      expect(qrModal).toHaveAttribute('data-address', '0x1234567890123456789012345678901234567890')

      // Opening the QR modal closes the account dropdown.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog', { name: /address qr modal/i })).not.toBeInTheDocument()
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
