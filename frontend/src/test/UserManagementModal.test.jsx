import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import UserManagementModal from '../components/ui/UserManagementModal'
import { Web3Provider } from '../contexts/Web3Context'
import { UserPreferencesProvider } from '../contexts/UserPreferencesContext'
import { UIProvider } from '../contexts/UIContext'
import { ThemeProvider } from '../contexts/ThemeContext'

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1234567890123456789012345678901234567890',
    isConnected: true
  }),
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'MetaMask' }]
  }),
  useDisconnect: () => ({
    disconnect: vi.fn()
  }),
  useChainId: () => 61,
  useSwitchChain: () => ({
    switchChain: vi.fn()
  }),
  WagmiProvider: ({ children }) => children,
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({})),
}))

// Mock wagmi/connectors
vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({})),
}))

// Mock window.ethereum
global.window.ethereum = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}

const renderWithProviders = (ui, { isConnected = true } = {}) => {
  return render(
    <ThemeProvider>
      <UIProvider>
        <Web3Provider>
          <UserPreferencesProvider>
            {ui}
          </UserPreferencesProvider>
        </Web3Provider>
      </UIProvider>
    </ThemeProvider>
  )
}

describe('UserManagementModal', () => {
  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('When wallet is not connected', () => {
    it('should render connect wallet prompt', () => {
      vi.mock('../hooks/useWeb3', () => ({
        useWeb3: () => ({ account: null, isConnected: false }),
        useWallet: () => ({ connectWallet: vi.fn(), disconnectWallet: vi.fn() })
      }))

      renderWithProviders(<UserManagementModal />)
      
      expect(screen.getByText(/Connect Your Wallet/i)).toBeInTheDocument()
      expect(screen.getByText(/Connect your Web3 wallet to access all features/i)).toBeInTheDocument()
    })

    it('should show connect wallet button', () => {
      vi.mock('../hooks/useWeb3', () => ({
        useWeb3: () => ({ account: null, isConnected: false }),
        useWallet: () => ({ connectWallet: vi.fn(), disconnectWallet: vi.fn() })
      }))

      renderWithProviders(<UserManagementModal />)
      
      const connectButton = screen.getByText('Connect Wallet')
      expect(connectButton).toBeInTheDocument()
    })
  })

  describe('When wallet is connected', () => {
    it('should render tab navigation', () => {
      renderWithProviders(<UserManagementModal />)
      
      expect(screen.getByRole('tab', { name: /Profile/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Search Markets/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Swap Tokens/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Launch Market/i })).toBeInTheDocument()
    })

    it('should show profile tab by default', () => {
      renderWithProviders(<UserManagementModal />)
      
      const profileTab = screen.getByRole('tab', { name: /Profile/i })
      expect(profileTab).toHaveAttribute('aria-selected', 'true')
      expect(profileTab).toHaveClass('active')
    })

    it('should display wallet address in profile tab', () => {
      renderWithProviders(<UserManagementModal />)
      
      expect(screen.getByText(/0x1234567890123456789012345678901234567890/i)).toBeInTheDocument()
    })

    it('should display ClearPath status section', () => {
      renderWithProviders(<UserManagementModal />)
      
      expect(screen.getByText(/ClearPath Status/i)).toBeInTheDocument()
      expect(screen.getByText(/Inactive/i)).toBeInTheDocument()
    })

    it('should allow toggling ClearPath status', async () => {
      renderWithProviders(<UserManagementModal />)
      
      const toggleButton = screen.getByText(/Activate ClearPath/i)
      expect(toggleButton).toBeInTheDocument()
      
      fireEvent.click(toggleButton)
      
      await waitFor(() => {
        expect(screen.getByText(/Active/i)).toBeInTheDocument()
      })
    })

    it('should show disconnect wallet button', () => {
      renderWithProviders(<UserManagementModal />)
      
      expect(screen.getByText('Disconnect Wallet')).toBeInTheDocument()
    })
  })

  describe('Tab Navigation', () => {
    it('should switch to search tab when clicked', () => {
      renderWithProviders(<UserManagementModal />)
      
      const searchTab = screen.getByRole('tab', { name: /Search Markets/i })
      fireEvent.click(searchTab)
      
      expect(searchTab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByPlaceholderText(/Search for markets.../i)).toBeInTheDocument()
    })

    it('should switch to swap tab when clicked', () => {
      renderWithProviders(<UserManagementModal />)
      
      const swapTab = screen.getByRole('tab', { name: /Swap Tokens/i })
      fireEvent.click(swapTab)
      
      expect(swapTab).toHaveAttribute('aria-selected', 'true')
    })

    it('should switch to launch tab when clicked', () => {
      renderWithProviders(<UserManagementModal />)
      
      const launchTab = screen.getByRole('tab', { name: /Launch Market/i })
      fireEvent.click(launchTab)
      
      expect(launchTab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText(/Launch a New Market/i)).toBeInTheDocument()
    })
  })

  describe('Search Markets Tab', () => {
    it('should render search input', () => {
      renderWithProviders(<UserManagementModal />)
      
      const searchTab = screen.getByRole('tab', { name: /Search Markets/i })
      fireEvent.click(searchTab)
      
      const searchInput = screen.getByPlaceholderText(/Search for markets.../i)
      expect(searchInput).toBeInTheDocument()
    })

    it('should allow typing in search input', () => {
      renderWithProviders(<UserManagementModal />)
      
      const searchTab = screen.getByRole('tab', { name: /Search Markets/i })
      fireEvent.click(searchTab)
      
      const searchInput = screen.getByPlaceholderText(/Search for markets.../i)
      fireEvent.change(searchInput, { target: { value: 'test market' } })
      
      expect(searchInput).toHaveValue('test market')
    })
  })

  describe('Launch Market Tab', () => {
    it('should render launch market button', () => {
      renderWithProviders(<UserManagementModal />)
      
      const launchTab = screen.getByRole('tab', { name: /Launch Market/i })
      fireEvent.click(launchTab)
      
      expect(screen.getByText('Launch New Market')).toBeInTheDocument()
    })

    it('should show requirements list', () => {
      renderWithProviders(<UserManagementModal />)
      
      const launchTab = screen.getByRole('tab', { name: /Launch Market/i })
      fireEvent.click(launchTab)
      
      expect(screen.getByText(/Requirements:/i)).toBeInTheDocument()
      expect(screen.getByText(/Connected wallet with sufficient funds/i)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderWithProviders(<UserManagementModal />)
      
      const tabs = screen.getAllByRole('tab')
      tabs.forEach(tab => {
        expect(tab).toHaveAttribute('aria-selected')
      })
    })

    it('should have proper role for tabpanel', () => {
      renderWithProviders(<UserManagementModal />)
      
      const tabpanel = screen.getByRole('tabpanel')
      expect(tabpanel).toBeInTheDocument()
    })
  })
})
