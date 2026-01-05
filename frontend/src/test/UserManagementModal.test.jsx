import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserManagementModal from '../components/ui/UserManagementModal'
import {
  WalletProvider,
  Web3Provider,
  UserPreferencesProvider,
  UIProvider,
  ThemeProvider,
  ETCswapProvider,
  RoleProvider,
  PriceProvider
} from '../contexts'

// Create mockable functions for wagmi hooks
const mockUseAccount = vi.fn()
const mockUseConnect = vi.fn()
const mockUseDisconnect = vi.fn()
const mockUseChainId = vi.fn()
const mockUseSwitchChain = vi.fn()

vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useConnect: () => mockUseConnect(),
  useDisconnect: () => mockUseDisconnect(),
  useChainId: () => mockUseChainId(),
  useSwitchChain: () => mockUseSwitchChain(),
  WagmiProvider: ({ children }) => children,
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({})),
}))

// Mock wagmi/connectors
vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({})),
  walletConnect: vi.fn(() => ({})),
}))

const renderWithProviders = (ui, { isConnected = true, connectors } = {}) => {
  // Set up mocks based on connection state
  mockUseAccount.mockReturnValue({
    address: isConnected ? '0x1234567890123456789012345678901234567890' : null,
    isConnected
  })
  mockUseConnect.mockReturnValue({
    connect: vi.fn(),
    connectors: connectors || [{ id: 'injected', name: 'MetaMask' }]
  })
  mockUseDisconnect.mockReturnValue({
    disconnect: vi.fn()
  })
  mockUseChainId.mockReturnValue(61)
  mockUseSwitchChain.mockReturnValue({
    switchChain: vi.fn()
  })
  
  // Create a new QueryClient for each test
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <WalletProvider>
            <Web3Provider>
              <UserPreferencesProvider>
                <RoleProvider>
                  <ETCswapProvider>
                    <UIProvider>
                      <PriceProvider>
                        {ui}
                      </PriceProvider>
                    </UIProvider>
                  </ETCswapProvider>
                </RoleProvider>
              </UserPreferencesProvider>
            </Web3Provider>
          </WalletProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

describe('UserManagementModal', () => {
  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('When wallet is not connected', () => {
    it('should return null and not render anything', () => {
      const { container } = renderWithProviders(<UserManagementModal />, { isConnected: false })
      
      // The modal returns null when not connected
      expect(container).toBeEmptyDOMElement()
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

    it('should display wallet address in profile tab and header', () => {
      renderWithProviders(<UserManagementModal />)
      
      // Full address appears in multiple places (header and profile section)
      const fullAddresses = screen.getAllByText('0x1234567890123456789012345678901234567890')
      expect(fullAddresses.length).toBeGreaterThanOrEqual(1)
      // Shortened address appears in header
      expect(screen.getByText(/0x1234...7890/i)).toBeInTheDocument()
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
      
      expect(screen.getByText('Disconnect')).toBeInTheDocument()
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
