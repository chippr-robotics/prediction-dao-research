import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import WalletButton from '../components/wallet/WalletButton'
import { RoleContext, ROLES, ROLE_INFO, UIContext, UserPreferencesContext } from '../contexts'
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
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({}))
}))

// Mock hooks
vi.mock('../hooks', () => ({
  useWalletRoles: vi.fn(),
  useWeb3: vi.fn(() => ({ signer: {} }))
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
    <div role="dialog" aria-label="Friend Markets Modal"><button onClick={onClose}>Close</button></div>
  ) : null,
  FriendMarketsModal: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="Friend Markets Modal"><button onClick={onClose}>Close</button></div>
  ) : null
}))

vi.mock('../components/fairwins/MarketCreationModal', () => ({
  default: ({ isOpen, onClose }) => isOpen ? (
    <div role="dialog" aria-label="Create Market Modal"><button onClick={onClose}>Close</button></div>
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

describe('WalletButton Component - Market Creation', () => {
  const mockShowModal = vi.fn()
  const mockHideModal = vi.fn()

  const defaultUIContext = {
    showModal: mockShowModal,
    hideModal: mockHideModal,
    modal: null
  }

  const renderWithProviders = (component, options = {}) => {
    const {
      uiContext = defaultUIContext
    } = options

    return render(
      <BrowserRouter>
        <UIContext.Provider value={uiContext}>
          {component}
        </UIContext.Provider>
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

  describe('Create Market Feature', () => {
    it('shows create market button for users with MARKET_MAKER role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Create New Market')).toBeInTheDocument()
      })
    })

    it('shows purchase access prompt for users without MARKET_MAKER role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [],
        hasRole: vi.fn(() => false)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Get Market Maker Access')).toBeInTheDocument()
      })
    })

    it('opens market creation modal when create market button is clicked', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      // Click create market button
      const createMarketBtn = await screen.findByText('Create New Market')
      await user.click(createMarketBtn)

      // Modal should be open
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /create market/i })).toBeInTheDocument()
      })
    })

    it('closes dropdown when create market button is clicked', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      // Click create market button
      const createMarketBtn = await screen.findByText('Create New Market')
      await user.click(createMarketBtn)

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Prediction Markets')).not.toBeInTheDocument()
      })
    })

    it('displays Prediction Markets section header', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Prediction Markets')).toBeInTheDocument()
      })
    })
  })

  describe('Friend Market and Create Market Integration', () => {
    it('shows both friend market and create market options when user has both roles', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET, ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET || role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        expect(screen.getByText('Create Friend Market')).toBeInTheDocument()
        expect(screen.getByText('Create New Market')).toBeInTheDocument()
      })
    })

    it('create market button is positioned after friend market section', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.FRIEND_MARKET, ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.FRIEND_MARKET || role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      // Get both section titles - use getAllByText since there may be multiple matches
      await waitFor(() => {
        const friendMarketsSections = screen.getAllByText('Friend Markets')
        const predictionMarketsSection = screen.getByText('Prediction Markets')

        // Find the section title (not the role badge) by checking the className
        const friendMarketsSection = friendMarketsSections.find(el => 
          el.className.includes('wallet-section-title')
        ) || friendMarketsSections[friendMarketsSections.length - 1]

        // Prediction Markets should come after Friend Markets in the DOM
        expect(friendMarketsSection.compareDocumentPosition(predictionMarketsSection))
          .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      })
    })
  })

  describe('Accessibility', () => {
    it('create market button has correct role', async () => {
      const user = userEvent.setup()
      useWalletRoles.mockReturnValue({
        roles: [ROLES.MARKET_MAKER],
        hasRole: vi.fn((role) => role === ROLES.MARKET_MAKER)
      })

      renderWithProviders(<WalletButton />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /wallet account/i })
      await user.click(button)

      await waitFor(() => {
        const createMarketBtn = screen.getByText('Create New Market').closest('button')
        expect(createMarketBtn).toHaveAttribute('role', 'menuitem')
      })
    })
  })
})
