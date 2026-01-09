import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FriendMarketsModal from '../components/fairwins/FriendMarketsModal'
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

// Mock wallet and network state
let mockWalletState = {
  isConnected: true,
  account: '0x1234567890123456789012345678901234567890'
}
let mockWeb3State = {
  isCorrectNetwork: true
}

// Mock the hooks module directly
vi.mock('../hooks', () => ({
  useWallet: () => ({
    isConnected: mockWalletState.isConnected,
    account: mockWalletState.account
  }),
  useWeb3: () => ({
    signer: {},
    isCorrectNetwork: mockWeb3State.isCorrectNetwork,
    switchNetwork: vi.fn()
  })
}))

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

// Mock qrcode.react
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, ...props }) => (
    <svg data-testid="qr-code" data-value={value} {...props}>
      QR Code Mock
    </svg>
  ),
}))

// Sample test data - now includes currency field (USC is default)
const mockActiveMarkets = [
  {
    id: 'market-1',
    type: 'oneVsOne',
    description: 'Patriots will win the Super Bowl',
    stakeAmount: '10',
    currency: 'USC',
    currencySymbol: 'USC',
    tradingPeriod: '7',
    participants: ['0x1234567890123456789012345678901234567890', '0xabcdef1234567890123456789012345678901234'],
    creator: '0x1234567890123456789012345678901234567890',
    createdAt: '2024-01-15T10:00:00Z',
    endDate: '2024-01-22T10:00:00Z',
    status: 'active'
  },
  {
    id: 'market-2',
    type: 'smallGroup',
    description: 'BTC will reach $100k by EOY',
    stakeAmount: '25',
    currency: 'ETC',
    currencySymbol: 'ETC',
    tradingPeriod: '30',
    participants: [
      '0x1234567890123456789012345678901234567890',
      '0xabcdef1234567890123456789012345678901234',
      '0x9876543210987654321098765432109876543210'
    ],
    creator: '0xabcdef1234567890123456789012345678901234',
    createdAt: '2024-01-10T10:00:00Z',
    endDate: '2024-02-10T10:00:00Z',
    status: 'pending'
  }
]

const mockPastMarkets = [
  {
    id: 'market-3',
    type: 'eventTracking',
    description: 'World Cup Final Winner',
    stakeAmount: '50',
    currency: 'WETC',
    currencySymbol: 'WETC',
    tradingPeriod: '14',
    participants: [
      '0x1234567890123456789012345678901234567890',
      '0xabcdef1234567890123456789012345678901234',
      '0x9876543210987654321098765432109876543210',
      '0x1111222233334444555566667777888899990000'
    ],
    creator: '0x1234567890123456789012345678901234567890',
    createdAt: '2023-12-01T10:00:00Z',
    endDate: '2023-12-15T10:00:00Z',
    status: 'resolved',
    outcome: 'Won'
  }
]

const renderWithProviders = (ui, { isConnected = true, account = '0x1234567890123456789012345678901234567890', isCorrectNetwork = true } = {}) => {
  // Set up mock state for hooks
  mockWalletState.isConnected = isConnected
  mockWalletState.account = isConnected ? account : null
  mockWeb3State.isCorrectNetwork = isCorrectNetwork

  // Set up mocks based on connection state
  mockUseAccount.mockReturnValue({
    address: isConnected ? account : null,
    isConnected
  })
  mockUseConnect.mockReturnValue({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'MetaMask' }]
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

describe('FriendMarketsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCreate: vi.fn(),
    activeMarkets: mockActiveMarkets,
    pastMarkets: mockPastMarkets,
    onMarketClick: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    // Reset mock state to defaults
    mockWalletState.isConnected = true
    mockWalletState.account = '0x1234567890123456789012345678901234567890'
    mockWeb3State.isCorrectNetwork = true
  })

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = renderWithProviders(
        <FriendMarketsModal {...defaultProps} isOpen={false} />
      )
      expect(container).toBeEmptyDOMElement()
    })

    it('should render when isOpen is true', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have correct ARIA attributes', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'friend-markets-modal-title')
    })
  })

  describe('Header', () => {
    it('should display modal title', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByText('Friend Markets')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByText('Private prediction markets with friends')).toBeInTheDocument()
    })

    it('should have a close button', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn()
      renderWithProviders(<FriendMarketsModal {...defaultProps} onClose={onClose} />)

      await userEvent.click(screen.getByRole('button', { name: /close modal/i }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Tab Navigation', () => {
    it('should render all three tabs', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      expect(screen.getByRole('tab', { name: /create/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /active/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /past/i })).toBeInTheDocument()
    })

    it('should have Create tab selected by default', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      const createTab = screen.getByRole('tab', { name: /create/i })
      expect(createTab).toHaveAttribute('aria-selected', 'true')
    })

    it('should switch to Active tab when clicked', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      expect(screen.getByRole('tab', { name: /active/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('should switch to Past tab when clicked', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /past/i }))
      expect(screen.getByRole('tab', { name: /past/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('should show active markets count badge', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      // Both mock markets have the connected user as a participant
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  describe('Create Tab - Type Selection', () => {
    it('should display market type selection by default', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      expect(screen.getByText('Choose Market Type')).toBeInTheDocument()
      expect(screen.getByText('1 vs 1')).toBeInTheDocument()
      expect(screen.getByText('Small Group')).toBeInTheDocument()
      expect(screen.getByText('Event Tracking')).toBeInTheDocument()
    })

    it('should display type descriptions', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      expect(screen.getByText('Head-to-head bet with a friend')).toBeInTheDocument()
      expect(screen.getByText('Pool predictions with 2-10 friends')).toBeInTheDocument()
      expect(screen.getByText('Competitive predictions for events')).toBeInTheDocument()
    })

    it('should navigate to form when 1v1 type is selected', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      expect(screen.getByText("What's the bet?")).toBeInTheDocument()
      expect(screen.getByLabelText(/opponent address/i)).toBeInTheDocument()
    })

    it('should navigate to form when Small Group type is selected', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Small Group'))
      expect(screen.getByText("What's the bet?")).toBeInTheDocument()
      expect(screen.getByLabelText(/member addresses/i)).toBeInTheDocument()
    })

    it('should navigate to form when Event Tracking type is selected', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Event Tracking'))
      expect(screen.getByText("What's the bet?")).toBeInTheDocument()
      expect(screen.getByLabelText(/member addresses/i)).toBeInTheDocument()
    })
  })

  describe('Create Tab - Form', () => {
    it('should have a back button to return to type selection', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.click(screen.getByText('Back'))

      expect(screen.getByText('Choose Market Type')).toBeInTheDocument()
    })

    it('should display type badge in form header', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      // The badge contains the type icon and label
      expect(screen.getByText(/1v1/i)).toBeInTheDocument()
    })

    it('should validate required fields', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument()
      })
    })

    it('should validate description minimum length', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Short')
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument()
      })
    })

    it('should validate opponent address for 1v1', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(screen.getByLabelText(/opponent address/i), 'invalid-address')
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText(/invalid ethereum address/i)).toBeInTheDocument()
      })
    })

    it('should not allow betting against yourself', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      // Enter the same address as the connected wallet
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0x1234567890123456789012345678901234567890'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText(/cannot bet against yourself/i)).toBeInTheDocument()
      })
    })

    it('should have stake input with default value', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      const stakeInput = screen.getByLabelText(/stake/i)
      // Default stake value should be 10
      expect(stakeInput).toHaveValue(10)
      // Stake input should have min attribute for validation (USC default has min=1)
      expect(stakeInput).toHaveAttribute('min', '1')
    })

    it('should validate member addresses for group markets', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Small Group'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'BTC will reach $100k by end of year')
      // Need at least 2 members to pass minimum count check and hit address validation
      await userEvent.type(screen.getByLabelText(/member addresses/i), '0xinvalid, 0xalsobad')
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        // Error message includes the truncated address
        expect(screen.getByText(/Invalid address:/i)).toBeInTheDocument()
      })
    })

    it('should validate minimum members for event tracking', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('Event Tracking'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Who will win the tournament')
      await userEvent.type(
        screen.getByLabelText(/member addresses/i),
        '0xabcdef1234567890123456789012345678901234, 0x9876543210987654321098765432109876543210'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText(/at least 3 members required/i)).toBeInTheDocument()
      })
    })

    it('should submit form with valid data', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled()
      })
    })
  })

  describe('Create Tab - Success State', () => {
    it('should show success state with QR code after creation', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText('Market Created!')).toBeInTheDocument()
        expect(screen.getByTestId('qr-code')).toBeInTheDocument()
        expect(screen.getByText('Scan to join market')).toBeInTheDocument()
      })
    })

    it('should have Create Another button in success state', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create another/i })).toBeInTheDocument()
      })
    })

    it('should return to type selection when Create Another is clicked', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByText('Market Created!')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /create another/i }))

      expect(screen.getByText('Choose Market Type')).toBeInTheDocument()
    })

    it('should have Copy Link button in success state', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument()
      })
    })
  })

  describe('Active Markets Tab', () => {
    it('should display active markets in a table', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      expect(screen.getByText('Patriots will win the Super Bowl')).toBeInTheDocument()
      expect(screen.getByText('BTC will reach $100k by EOY')).toBeInTheDocument()
    })

    it('should display market type badges', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      expect(screen.getByText('1v1')).toBeInTheDocument()
      expect(screen.getByText('Group')).toBeInTheDocument()
    })

    it('should display stake amounts', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      expect(screen.getByText('10 USC')).toBeInTheDocument()
      expect(screen.getByText('25 ETC')).toBeInTheDocument()
    })

    it('should display empty state when no active markets', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} activeMarkets={[]} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      expect(screen.getByText('No Active Markets')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create your first market/i })).toBeInTheDocument()
    })

    it('should navigate to create tab when clicking Create Your First Market', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} activeMarkets={[]} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByRole('button', { name: /create your first market/i }))

      expect(screen.getByRole('tab', { name: /create/i })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('Past Markets Tab', () => {
    it('should display past markets in a table', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /past/i }))

      expect(screen.getByText('World Cup Final Winner')).toBeInTheDocument()
    })

    it('should display outcome instead of end date for past markets', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /past/i }))

      expect(screen.getByText('Won')).toBeInTheDocument()
    })

    it('should display empty state when no past markets', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} pastMarkets={[]} />)

      await userEvent.click(screen.getByRole('tab', { name: /past/i }))

      expect(screen.getByText('No Past Markets')).toBeInTheDocument()
      expect(screen.getByText('Completed markets will appear here.')).toBeInTheDocument()
    })
  })

  describe('Market Detail View', () => {
    it('should show detail view when clicking on a market', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        expect(screen.getByText('Back to list')).toBeInTheDocument()
      })
    })

    it('should display market details', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        // Check for detail view elements
        expect(screen.getByText('Back to list')).toBeInTheDocument()
        expect(screen.getByText('10 USC')).toBeInTheDocument()
        expect(screen.getByText('Share this market')).toBeInTheDocument()
      })
    })

    it('should display QR code in detail view', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        expect(screen.getByText('Share this market')).toBeInTheDocument()
        expect(screen.getAllByTestId('qr-code').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('should return to list when clicking Back to list', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        expect(screen.getByText('Back to list')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByText('Back to list'))

      expect(screen.getByText('BTC will reach $100k by EOY')).toBeInTheDocument()
    })

    it('should mark current user as You in participants list', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        // The "You" tag should appear in participant list
        const youTag = screen.queryByText('You')
        expect(youTag).toBeInTheDocument()
      })
    })

    it('should mark creator in participants list', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))
      await userEvent.click(screen.getByText('Patriots will win the Super Bowl'))

      await waitFor(() => {
        // The "Creator" tag should appear in participant list
        const creatorTag = screen.queryByText('Creator')
        expect(creatorTag).toBeInTheDocument()
      })
    })
  })

  describe('Wallet Connection', () => {
    it('should have create button enabled when wallet is connected and on correct network', async () => {
      // Default state is connected with correct network
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      // Button should be enabled (not disabled) when wallet is connected
      const createButton = screen.getByRole('button', { name: /create market/i })
      expect(createButton).not.toBeDisabled()
    })

    it('should show validation errors when form is submitted with invalid data', async () => {
      // When connected, validation errors should be displayed
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      // Leave description empty and try to submit
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        // Should show validation error
        expect(screen.getByText(/description is required/i)).toBeInTheDocument()
      })
    })
  })

  describe('Keyboard Navigation', () => {
    it('should close modal on Escape key', async () => {
      const onClose = vi.fn()
      renderWithProviders(<FriendMarketsModal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

      expect(onClose).toHaveBeenCalled()
    })

    it('should allow keyboard navigation on table rows', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      const row = screen.getByText('Patriots will win the Super Bowl').closest('tr')
      fireEvent.keyDown(row, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('Back to list')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper tab roles', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      const tablist = screen.getByRole('tablist')
      expect(tablist).toBeInTheDocument()

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(3)
    })

    it('should have proper tabpanel role', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      const tabpanel = screen.getByRole('tabpanel')
      expect(tabpanel).toBeInTheDocument()
    })

    it('should have aria-selected on tabs', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      const createTab = screen.getByRole('tab', { name: /create/i })
      expect(createTab).toHaveAttribute('aria-selected', 'true')

      const activeTab = screen.getByRole('tab', { name: /active/i })
      expect(activeTab).toHaveAttribute('aria-selected', 'false')
    })

    it('should have proper table roles', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })

  describe('Currency Selection', () => {
    it('should have currency selector in create form', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))

      expect(screen.getByLabelText(/payment currency/i)).toBeInTheDocument()
    })

    it('should default to USC stablecoin', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))

      // USC should be shown in the currency selector
      expect(screen.getByText('USC')).toBeInTheDocument()
    })

    it('should show currency hint text', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))

      expect(screen.getByText(/USC.*stablecoin.*recommended.*price stability/i)).toBeInTheDocument()
    })

    it('should show correct stake label based on selected currency', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))

      // Default is USC, so stake label should show USC
      expect(screen.getByLabelText(/stake.*usc/i)).toBeInTheDocument()
    })

    it('should validate stake amount based on currency minimum', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )

      // Clear the stake field and enter a value below minimum
      const stakeInput = screen.getByLabelText(/stake/i)
      await userEvent.clear(stakeInput)
      await userEvent.type(stakeInput, '0.5') // Below USC minimum of 1

      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        // Should show minimum stake error for USC (minimum is $1)
        expect(screen.getByText(/minimum stake is 1 usc/i)).toBeInTheDocument()
      })
    })

    it('should display currencies in active markets table', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /active/i }))

      // Should display stake amounts with their currencies
      expect(screen.getByText('10 USC')).toBeInTheDocument()
      expect(screen.getByText('25 ETC')).toBeInTheDocument()
    })

    it('should display currency in past markets', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('tab', { name: /past/i }))

      expect(screen.getByText('50 WETC')).toBeInTheDocument()
    })

    it('should pass currency data to onCreate callback', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled()
        const callArgs = onCreate.mock.calls[0][0]
        expect(callArgs.data.currency).toBe('USC')
        expect(callArgs.data.currencySymbol).toBe('USC')
      })
    })

    it('should reset currency to USC when creating another market', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      // Create first market
      await userEvent.click(screen.getByText('1 vs 1'))
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create market/i }))

      // Wait for success and click create another
      await waitFor(() => {
        expect(screen.getByText('Market Created!')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /create another/i }))

      // Select type again
      await userEvent.click(screen.getByText('1 vs 1'))

      // Currency should be reset to USC (default)
      expect(screen.getByText('USC')).toBeInTheDocument()
    })
  })
})
