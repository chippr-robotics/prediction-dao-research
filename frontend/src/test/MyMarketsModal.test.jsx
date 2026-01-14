import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyMarketsModal from '../components/fairwins/MyMarketsModal'
import { WalletContext, ThemeContext, UIContext } from '../contexts'
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
  useDataFetcher: vi.fn(() => ({
    getMarkets: vi.fn(() => Promise.resolve([])),
    getPositions: vi.fn(() => Promise.resolve([]))
  }))
}))

import { useWallet, useWeb3, useDataFetcher } from '../hooks'

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

  const renderWithProviders = (component, options = {}) => {
    const {
      walletContext = defaultWalletContext,
      themeContext = defaultThemeContext,
      uiContext = defaultUIContext
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
    useDataFetcher.mockReturnValue({
      getMarkets: vi.fn(() => Promise.resolve([])),
      getPositions: vi.fn(() => Promise.resolve([]))
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

      expect(screen.getByText('My Markets')).toBeInTheDocument()
    })

    it('should display subtitle', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      expect(screen.getByText('Manage your prediction markets and positions')).toBeInTheDocument()
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
        expect(screen.getByText('No Markets Created')).toBeInTheDocument()
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
        expect(screen.getByText('No Market History')).toBeInTheDocument()
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
        proposalTitle: 'Test Market 1',
        description: 'Test description',
        creator: '0x1234567890123456789012345678901234567890',
        tradingEndTime: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
        status: 'active',
        category: 'crypto',
        marketType: 'prediction'
      },
      {
        id: '2',
        proposalTitle: 'Test Market 2',
        description: 'Another test',
        creator: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        tradingEndTime: BigInt(Math.floor(Date.now() / 1000) + 86400 * 14),
        status: 'active',
        category: 'sports',
        marketType: 'prediction'
      }
    ]

    const mockPositions = [
      {
        marketId: '2',
        side: 'Yes',
        amount: '100'
      }
    ]

    beforeEach(() => {
      useDataFetcher.mockReturnValue({
        getMarkets: vi.fn(() => Promise.resolve(mockMarkets)),
        getPositions: vi.fn(() => Promise.resolve(mockPositions))
      })
    })

    it('should display markets user has created in Created tab', async () => {
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
        expect(screen.getByText('Test Market 1')).toBeInTheDocument()
      })
    })

    it('should display markets user is participating in', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
        )
      })

      await waitFor(() => {
        expect(screen.getByText('Test Market 2')).toBeInTheDocument()
      })
    })

    it('should show tab badges with counts', async () => {
      await act(async () => {
        renderWithProviders(
          <MyMarketsModal isOpen={true} onClose={mockOnClose} />
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
        expect(screen.getByText('My Markets')).toBeInTheDocument()
      })

      const title = screen.getByText('My Markets')
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
