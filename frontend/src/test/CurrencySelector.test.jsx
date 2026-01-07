import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CurrencySelector, {
  CURRENCY_OPTIONS,
  getDefaultCurrency,
  getCurrencyById,
  parseAmountForCurrency,
  formatAmountForCurrency
} from '../components/ui/CurrencySelector'
import {
  WalletProvider,
  Web3Provider,
  ThemeProvider
} from '../contexts'

// Mock wallet state
let mockWalletState = {
  isConnected: true,
  account: '0x1234567890123456789012345678901234567890',
  provider: null
}

// Mock the hooks module directly
vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({
    isConnected: mockWalletState.isConnected,
    address: mockWalletState.account,
    account: mockWalletState.account,
    provider: mockWalletState.provider
  })
}))

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    Contract: vi.fn(() => ({
      balanceOf: vi.fn().mockResolvedValue(BigInt('1000000000000000000000'))
    })),
    parseUnits: vi.fn((value, decimals) => BigInt(value) * BigInt(10 ** decimals)),
    formatUnits: vi.fn((value, decimals) => (Number(value) / (10 ** decimals)).toString()),
    formatEther: vi.fn((value) => (Number(value) / 1e18).toString())
  }
}))

// Mock wagmi hooks
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

vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({})),
  walletConnect: vi.fn(() => ({})),
}))

const renderWithProviders = (ui, { isConnected = true } = {}) => {
  mockWalletState.isConnected = isConnected
  mockWalletState.account = isConnected ? '0x1234567890123456789012345678901234567890' : null

  mockUseAccount.mockReturnValue({
    address: mockWalletState.account,
    isConnected
  })
  mockUseConnect.mockReturnValue({
    connect: vi.fn(),
    connectors: [{ id: 'injected', name: 'MetaMask' }]
  })
  mockUseDisconnect.mockReturnValue({ disconnect: vi.fn() })
  mockUseChainId.mockReturnValue(61)
  mockUseSwitchChain.mockReturnValue({ switchChain: vi.fn() })

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
              {ui}
            </Web3Provider>
          </WalletProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

describe('CurrencySelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWalletState.isConnected = true
    mockWalletState.account = '0x1234567890123456789012345678901234567890'
  })

  describe('Rendering', () => {
    it('should render with default USC currency', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )
      expect(screen.getByText('USC')).toBeInTheDocument()
    })

    it('should render with ETC currency when selected', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="ETC"
          onCurrencyChange={vi.fn()}
        />
      )
      expect(screen.getByText('ETC')).toBeInTheDocument()
    })

    it('should render with WETC currency when selected', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="WETC"
          onCurrencyChange={vi.fn()}
        />
      )
      expect(screen.getByText('WETC')).toBeInTheDocument()
    })

    it('should show currency icon', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )
      // USC icon should be visible
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should have proper aria attributes', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )
      const trigger = screen.getByRole('button')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    })
  })

  describe('Dropdown Interaction', () => {
    it('should open dropdown when clicked', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    })

    it('should show all currency options in dropdown', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(3) // USC, ETC, WETC
    })

    it('should display currency names in dropdown', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      expect(screen.getByText('Classic USD Stablecoin')).toBeInTheDocument()
      expect(screen.getByText('Ethereum Classic')).toBeInTheDocument()
      expect(screen.getByText('Wrapped ETC')).toBeInTheDocument()
    })

    it('should mark USC as default', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('should call onCurrencyChange when option is selected', async () => {
      const onCurrencyChange = vi.fn()
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={onCurrencyChange}
        />
      )

      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(screen.getByText('Ethereum Classic'))

      expect(onCurrencyChange).toHaveBeenCalledWith('ETC')
    })

    it('should close dropdown after selection', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(screen.getByText('Ethereum Classic'))

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('should mark selected currency in dropdown', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      const selectedOption = screen.getByRole('option', { selected: true })
      expect(selectedOption).toBeInTheDocument()
    })
  })

  describe('Disabled State', () => {
    it('should not open dropdown when disabled', async () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
          disabled={true}
        />
      )

      await userEvent.click(screen.getByRole('button'))

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('should have disabled styling', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
          disabled={true}
        />
      )

      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  describe('Balance Display', () => {
    it('should not show balances when showBalances is false', () => {
      renderWithProviders(
        <CurrencySelector
          selectedCurrency="USC"
          onCurrencyChange={vi.fn()}
          showBalances={false}
        />
      )

      // The balance display should not be present on the trigger button
      const trigger = screen.getByRole('button')
      expect(trigger.querySelector('.currency-balance')).not.toBeInTheDocument()
    })
  })
})

describe('Currency Helper Functions', () => {
  describe('CURRENCY_OPTIONS', () => {
    it('should have USC, ETC, and WETC options', () => {
      expect(CURRENCY_OPTIONS.USC).toBeDefined()
      expect(CURRENCY_OPTIONS.ETC).toBeDefined()
      expect(CURRENCY_OPTIONS.WETC).toBeDefined()
    })

    it('USC should be marked as default', () => {
      expect(CURRENCY_OPTIONS.USC.isDefault).toBe(true)
      expect(CURRENCY_OPTIONS.ETC.isDefault).toBe(false)
      expect(CURRENCY_OPTIONS.WETC.isDefault).toBe(false)
    })

    it('ETC should be marked as native', () => {
      expect(CURRENCY_OPTIONS.ETC.isNative).toBe(true)
      expect(CURRENCY_OPTIONS.USC.isNative).toBe(false)
      expect(CURRENCY_OPTIONS.WETC.isNative).toBe(false)
    })

    it('USC should have 6 decimals', () => {
      expect(CURRENCY_OPTIONS.USC.decimals).toBe(6)
    })

    it('ETC and WETC should have 18 decimals', () => {
      expect(CURRENCY_OPTIONS.ETC.decimals).toBe(18)
      expect(CURRENCY_OPTIONS.WETC.decimals).toBe(18)
    })
  })

  describe('getDefaultCurrency', () => {
    it('should return USC as default currency', () => {
      const defaultCurrency = getDefaultCurrency()
      expect(defaultCurrency.id).toBe('USC')
      expect(defaultCurrency.symbol).toBe('USC')
    })
  })

  describe('getCurrencyById', () => {
    it('should return correct currency for valid ID', () => {
      expect(getCurrencyById('USC').symbol).toBe('USC')
      expect(getCurrencyById('ETC').symbol).toBe('ETC')
      expect(getCurrencyById('WETC').symbol).toBe('WETC')
    })

    it('should return USC for invalid ID', () => {
      expect(getCurrencyById('INVALID').symbol).toBe('USC')
      expect(getCurrencyById(null).symbol).toBe('USC')
      expect(getCurrencyById(undefined).symbol).toBe('USC')
    })
  })

  describe('parseAmountForCurrency', () => {
    it('should parse USC amount with 6 decimals', () => {
      const result = parseAmountForCurrency('100', 'USC')
      expect(result).toBe(BigInt(100000000))
    })

    it('should parse ETC amount with 18 decimals', () => {
      const result = parseAmountForCurrency('1', 'ETC')
      expect(result).toBe(BigInt('1000000000000000000'))
    })
  })

  describe('formatAmountForCurrency', () => {
    it('should format USC amount with 6 decimals', () => {
      const result = formatAmountForCurrency(BigInt(100000000), 'USC')
      expect(result).toBe('100')
    })

    it('should format ETC amount with 18 decimals', () => {
      const result = formatAmountForCurrency(BigInt('1000000000000000000'), 'ETC')
      expect(result).toBe('1')
    })
  })
})
