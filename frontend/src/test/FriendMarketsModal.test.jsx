import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FriendMarketsModal from '../components/fairwins/FriendMarketsModal'
import {
  WalletProvider,
  UserPreferencesProvider,
  UIProvider,
  ThemeProvider,
  DexProvider,
  PriceProvider
} from '../contexts'

// The exposed oracle resolution tabs (Chainlink Data Feed / Functions / UMA) are
// gated by VITE_ORACLE_MODELS, which constants/wagerDefaults reads ONCE at module
// load. vi.hoisted runs before the (hoisted) component import, so set it to 'all'
// here — otherwise the default 'polymarket-only' hides those tabs and every
// oracle-tab spec below fails. Self-contained: vitest isolates env per test file.
vi.hoisted(() => {
  vi.stubEnv('VITE_ORACLE_MODELS', 'all')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

// Mock wallet and network state
let mockWalletState = {
  isConnected: true,
  account: '0x1234567890123456789012345678901234567890'
}
let mockWeb3State = {
  isCorrectNetwork: true
}

// Mock the hooks module directly
vi.mock('../hooks', () => {
  const mockSigner = {
    signMessage: vi.fn().mockResolvedValue('0xmocksignature123456789'),
    getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
  }

  return {
    useWallet: () => ({
      isConnected: mockWalletState.isConnected,
      account: mockWalletState.account,
      signer: mockSigner
    }),
    useWeb3: () => ({
      signer: mockSigner,
      isCorrectNetwork: mockWeb3State.isCorrectNetwork,
      switchNetwork: vi.fn()
    })
  }
})

// Mock useEncryption — only the create-flow methods are exercised now.
vi.mock('../hooks/useEncryption', () => ({
  useEncryption: () => ({
    createEncrypted: vi.fn().mockResolvedValue({
      encrypted: true,
      envelope: { version: '1.0', recipients: [] },
      metadata: { name: 'test' }
    }),
    decryptMetadata: vi.fn().mockResolvedValue({ name: 'test' }),
    addParticipant: vi.fn().mockResolvedValue({}),
    canUserDecrypt: vi.fn().mockReturnValue(true),
    isEncrypted: vi.fn().mockReturnValue(false),
    getPublicKeyFromSignature: vi.fn().mockReturnValue('0xpublickey'),
    lookupOpponentKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
    opponentHasKey: vi.fn().mockResolvedValue(true),
    addRecipientByPublicKey: vi.fn().mockReturnValue({ version: '1.0', recipients: [] }),
    isInitialized: true,
    isInitializing: false
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
  useWalletClient: () => ({ data: null }),
  useEnsAddress: () => ({ data: null, isLoading: false, isError: false, error: null }),
  useEnsName: () => ({ data: null, isLoading: false, isError: false, error: null }),
  WagmiProvider: ({ children }) => children,
  createConfig: vi.fn(() => ({})),
  http: vi.fn(() => ({})),
}))

vi.mock('wagmi/chains', () => ({
  mainnet: { id: 1 },
}))

vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({})),
  walletConnect: vi.fn(() => ({})),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, ...props }) => (
    <svg data-testid="qr-code" data-value={value} {...props}>
      QR Code Mock
    </svg>
  ),
}))

// Mock the contracts config so the modal sees the v2 Amoy adapter addresses
// during tests (the real module reads VITE_NETWORK_ID at module-load time,
// defaulting to 63 / Mordor which has no v2 contracts). The new oracle-type
// dropdown options gate on these addresses being non-empty.
vi.mock('../config/contracts', async (importOriginal) => {
  const actual = await importOriginal()
  const stubs = {
    chainlinkDataFeedAdapter: '0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23',
    chainlinkFunctionsAdapter: '0x074fC18C1E322a7537b53B8B2Bf0762629E3b532',
    umaAdapter: '0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88',
  }
  return {
    ...actual,
    getContractAddress: (name) => stubs[name] ?? actual.getContractAddress(name),
    // The modal now resolves adapters chain-aware; mirror the stubs here so the
    // oracle resolution types are still treated as available in tests.
    getContractAddressForChain: (name) => stubs[name] ?? actual.getContractAddress(name),
  }
})

// Stub PolymarketBrowser so the linked-market UI renders without making
// real gamma-api calls. Exposes a button per (mocked) market that fires
// the modal's onSelectMarket handler.
vi.mock('../components/fairwins/PolymarketBrowser', () => ({
  default: ({ onSelectMarket, selectedConditionId }) => {
    const mockMarkets = (globalThis.__mockPolymarketBrowserMarkets__ || [])
    return (
      <div data-testid="mock-polymarket-browser" data-selected={selectedConditionId || ''}>
        {mockMarkets.map((m) => (
          <button
            key={m.conditionId}
            type="button"
            onClick={() => onSelectMarket?.(m)}
            data-testid={`pmb-pick-${m.conditionId}`}
          >
            {m.question}
          </button>
        ))}
      </div>
    )
  }
}))

// Stub OracleConditionPicker so the modal's new oracle-extensible flow can
// be tested without going through useOracleConditions (which has its own
// unit tests). The stub exposes a Pick button per kind that fires onChange
// with a canonical conditionId so we can assert downstream wiring.
const STUB_ORACLE_CONDITION_ID = '0x' + 'cd'.repeat(32)
vi.mock('../components/fairwins/OracleConditionPicker', () => ({
  default: ({ kind, adapterAddress, value, onChange, error }) => (
    <div data-testid={`mock-oracle-picker-${kind}`} data-adapter={adapterAddress || ''} data-value={value || ''}>
      <button
        type="button"
        data-testid={`mock-pick-${kind}`}
        onClick={() => onChange?.(STUB_ORACLE_CONDITION_ID)}
      >Pick a {kind} condition</button>
      {error && <span data-testid={`mock-picker-error-${kind}`}>{error}</span>}
    </div>
  )
}))

// Stub QRScanner so opening it from the Opponent-address scan button doesn't
// boot the real html5-qrcode camera stack (jsdom has no MediaStreamTrack). The
// scanner's own behavior is covered by QRScanner.test.jsx; here we only assert
// the scan button opens it (spec 009 US4, S3).
vi.mock('../components/ui/QRScanner', () => ({
  default: ({ isOpen }) =>
    isOpen ? <div role="dialog" aria-label="QR code scanner" /> : null,
}))

const renderWithProviders = (ui, { isConnected = true, account = '0x1234567890123456789012345678901234567890', isCorrectNetwork = true, chainId = 61 } = {}) => {
  mockWalletState.isConnected = isConnected
  mockWalletState.account = isConnected ? account : null
  mockWeb3State.isCorrectNetwork = isCorrectNetwork

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
  mockUseChainId.mockReturnValue(chainId)
  mockUseSwitchChain.mockReturnValue({
    switchChain: vi.fn()
  })

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
            <UserPreferencesProvider>
              <DexProvider>
                <UIProvider>
                  <PriceProvider>
                    {ui}
                  </PriceProvider>
                </UIProvider>
              </DexProvider>
            </UserPreferencesProvider>
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
    pendingTransaction: null,
    onClearPendingTransaction: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockWalletState.isConnected = true
    mockWalletState.account = '0x1234567890123456789012345678901234567890'
    mockWeb3State.isCorrectNetwork = true

    // Avoid provider creation errors during tests
    global.window.ethereum = undefined
  })

  describe('Private Wager encryption disclosure', () => {
    it('collapses the whole encryption explainer behind one disclosure, keeping toggle + badge', async () => {
      const user = userEvent.setup()
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      // Encryption is on by default: the toggle + badge stay visible…
      const toggle = await screen.findByRole('button', { name: /how encryption works/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByText(/End-to-End Encrypted/i)).toBeInTheDocument()
      // …but the explainer body (hint + field breakdown) is hidden until expanded.
      expect(screen.queryByText(/Only participants can decrypt/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Bet description & terms/i)).not.toBeInTheDocument()

      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(await screen.findByText(/Only participants can decrypt/i)).toBeInTheDocument()
      expect(screen.getByText(/Bet description & terms/i)).toBeInTheDocument()

      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText(/Bet description & terms/i)).not.toBeInTheDocument()
    })
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
      expect(screen.getByText('Wagers')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByText('Private wagers with friends')).toBeInTheDocument()
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

  describe('Direct-to-form behavior', () => {
    it('opens directly into the 1v1 form when no initialType is passed', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.getByLabelText(/what's the bet/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/opponent address/i)).toBeInTheDocument()
    })

    it('opens into the 1v1 form when initialType="oneVsOne"', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} initialType="oneVsOne" />)
      expect(screen.getByLabelText(/opponent address/i)).toBeInTheDocument()
    })

    it('opens into the Bookmaker form (with opponent + odds) when initialType="bookmaker"', () => {
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} initialType="bookmaker" resolutionCategory="all" />
      )
      expect(screen.getByLabelText(/opponent address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/opponent.*odds/i)).toBeInTheDocument()
    })

    it('no longer offers group / member-address inputs', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.queryByLabelText(/member addresses/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/minimum participants/i)).not.toBeInTheDocument()
    })

    it('participant category shows people-settled resolution options incl. Third Party', () => {
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} resolutionCategory="participant" />
      )
      const select = screen.getByLabelText(/who can resolve/i)
      const labels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
      // ThirdParty is re-enabled (Spec Kit 005): the arbitrator is now indexed
      // for discovery and encrypted-for, so they can find and resolve the wager.
      expect(labels).toEqual([
        'Either Party',
        'Creator Only',
        'Opponent Only',
        'Third Party (Arbitrator)',
      ])
    })

    it('selecting Third Party reveals a required arbitrator address input', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} initialType="oneVsOne" resolutionCategory="participant" />
      )
      const select = screen.getByLabelText(/who can resolve/i)
      // No arbitrator input until Third Party is chosen…
      expect(screen.queryByLabelText(/arbitrator address/i)).not.toBeInTheDocument()
      await user.selectOptions(select, '3') // ResolutionType.ThirdParty
      // …then the arbitrator input appears.
      expect(await screen.findByLabelText(/arbitrator address/i)).toBeInTheDocument()
    })

    it('oracle category shows oracle resolution tabs (not a dropdown)', () => {
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} resolutionCategory="oracle" />
      )
      // The oracle flow renders settlement sources as tabs at the top of the
      // form (no <select> dropdown), and excludes the participant-settled options.
      expect(screen.queryByRole('combobox', { name: /which oracle settles this/i })).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /polymarket/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /chainlink data feed/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /chainlink functions/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^uma$/i })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: /either party/i })).not.toBeInTheDocument()
    })

    it('shows the Polymarket search in the oracle flow (visible even when the tab strip is suppressed)', async () => {
      // Regression: under the default Polymarket-only exposure the oracle flow has
      // a single settlement type, so the tab strip is hidden — but the Polymarket
      // search (PolymarketBrowser) MUST still render. Previously the search was
      // nested inside the (hidden) tab block and disappeared entirely.
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} initialType="oneVsOne" resolutionCategory="oracle" />
      )
      expect(await screen.findByTestId('mock-polymarket-browser')).toBeInTheDocument()
    })

    it('locks oracle tabs whose source is unavailable on the active chain', () => {
      // On Hardhat (1337) the Polymarket CTF is unreachable, so the Polymarket
      // tab is shown locked/disabled rather than hidden.
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} resolutionCategory="oracle" />,
        { chainId: 1337 }
      )
      expect(screen.getByRole('tab', { name: /polymarket/i })).toBeDisabled()
    })

    it('no longer renders a type-selector or Back link', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.queryByText('Choose Wager Type')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument()
    })

    it('no longer renders the Active/Past tab strip', () => {
      // The modal's only tablist is now the resolution-source strip; the old
      // Active/Past navigation tabs are gone.
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      expect(screen.queryByRole('tab', { name: /^active$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: /^past$/i })).not.toBeInTheDocument()
    })
  })

  describe('Create Form', () => {
    it('should validate required fields', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument()
      })
    })

    it('should validate description minimum length', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Short')
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument()
      })
    })

    it('should validate opponent address for 1v1', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(screen.getByLabelText(/opponent address/i), 'invalid-address')
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/valid ethereum address or ENS name/i)
        ).toBeInTheDocument()
      })
    })

    it('should not allow betting against yourself', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0x1234567890123456789012345678901234567890'
      )
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/cannot bet against yourself/i)).toBeInTheDocument()
      })
    })

    it('should have stake input with default value', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      const stakeInput = screen.getByLabelText(/stake amount/i)
      expect(stakeInput).toHaveValue(10)
      expect(stakeInput).toHaveAttribute('min', '0.1')
    })

    it('should require an opponent address for a Bookmaker wager', async () => {
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} initialType="bookmaker" resolutionCategory="all" />
      )

      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/opponent address is required/i)).toBeInTheDocument()
      })
    })

    it('should submit form with valid data', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled()
      })
    })

    it('Cancel button closes the modal', async () => {
      const onClose = vi.fn()
      renderWithProviders(<FriendMarketsModal {...defaultProps} onClose={onClose} />)

      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  // Spec 009 US4 — the QR-scan affordance next to the Opponent Address field
  // must show its icon and open the scanner (contracts/qr-ui-contract.md S1–S3).
  describe('QR scan affordance (Opponent address)', () => {
    it('renders an accessible scan button with a QR icon', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      const scanBtn = screen.getByRole('button', { name: /scan qr code/i })
      expect(scanBtn).toBeInTheDocument()
      // The button must not be empty — its QR glyph icon must be present and sized.
      const icon = scanBtn.querySelector('svg')
      expect(icon).toBeTruthy()
      expect(icon).toHaveAttribute('width')
      expect(icon).toHaveAttribute('height')
    })

    it('opens the QR scanner when activated', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      await userEvent.click(screen.getByRole('button', { name: /scan qr code/i }))
      expect(
        await screen.findByRole('dialog', { name: /qr code scanner/i })
      ).toBeInTheDocument()
    })
  })

  describe('Success State', () => {
    const fillAndSubmit = async () => {
      await userEvent.type(screen.getByLabelText(/what's the bet/i), 'Patriots will win the Super Bowl')
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))
    }

    it('should show success state with QR code after creation', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await fillAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Wager Created!')).toBeInTheDocument()
        expect(screen.getByTestId('qr-code')).toBeInTheDocument()
        expect(screen.getByText('Share this QR code with participants to accept the wager')).toBeInTheDocument()
      })
    })

    // Spec 009 US1 / FR-005: the success QR must encode exactly the acceptance
    // link shown in the copy field (no broken/empty QR, no mismatched payload).
    it('success QR encodes the same acceptance link shown in the copy field', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await fillAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Wager Created!')).toBeInTheDocument()
      })

      const qr = screen.getByTestId('qr-code')
      const linkInput = screen.getByLabelText(/acceptance link/i)
      expect(qr.getAttribute('data-value')).toBeTruthy()
      expect(qr.getAttribute('data-value')).toBe(linkInput.value)
      expect(qr.getAttribute('data-value')).toContain('new-market-123')
    })

    it('should have Create Another button in success state', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await fillAndSubmit()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create another/i })).toBeInTheDocument()
      })
    })

    it('Create Another resets to a fresh form of the same type (no selector)', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await fillAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Wager Created!')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /create another/i }))

      // Back on a fresh 1v1 form, NOT a (removed) type selector.
      expect(screen.getByLabelText(/opponent address/i)).toBeInTheDocument()
      expect(screen.queryByText('Choose Wager Type')).not.toBeInTheDocument()
      expect(screen.getByLabelText(/what's the bet/i)).toHaveValue('')
    })

    it('should have Copy Link button in success state', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'new-market-123' })
      renderWithProviders(<FriendMarketsModal {...defaultProps} onCreate={onCreate} />)

      await fillAndSubmit()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument()
      })
    })
  })

  describe('Wallet Connection', () => {
    it('should have create button enabled when wallet is connected and on correct network', () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)
      const createButton = screen.getByRole('button', { name: /create wager/i })
      expect(createButton).not.toBeDisabled()
    })

    it('should show validation errors when form is submitted with invalid data', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />)

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
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
  })

  describe('Polymarket-pegged wagers', () => {
    const polymarketMarket = {
      conditionId: '0x' + 'a'.repeat(64),
      question: 'Will the Patriots win the Super Bowl?',
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      outcomes: [
        { name: 'Yes', price: 0.42 },
        { name: 'No', price: 0.58 },
      ],
    }

    beforeEach(() => {
      globalThis.__mockPolymarketBrowserMarkets__ = [polymarketMarket]
    })

    it('seeds the form when initialPolymarketMarket is provided', () => {
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} initialPolymarketMarket={polymarketMarket} />,
        { chainId: 80002 }
      )
      // The seeded market card is visible in the "selected market" panel.
      expect(screen.getByText(polymarketMarket.question)).toBeInTheDocument()
    })

    it('forwards oracleConditionId + creatorIsYes + resolutionType=4 to onCreate', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'wager-1' })
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} initialPolymarketMarket={polymarketMarket} />,
        { chainId: 80002 }
      )

      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Patriots win the Super Bowl - pegged to Polymarket'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )

      // Pick "I'm taking Yes" (first outcome — creatorSide '0' → creatorIsYes true).
      // The side picker buttons are rendered from selectedPolymarketMarket.outcomes.
      await userEvent.click(screen.getByRole('button', { name: /i'm taking yes/i }))

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled()
      })
      const callArg = onCreate.mock.calls[0][0]
      expect(callArg.data).toEqual(expect.objectContaining({
        oracleConditionId: polymarketMarket.conditionId,
        creatorIsYes: true,
        resolutionType: 4,  // canonical enum: Polymarket = 4
      }))
    })

    it('forwards creatorIsYes=false when the creator picks outcome index 1', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'wager-2' })
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} initialPolymarketMarket={polymarketMarket} />,
        { chainId: 80002 }
      )

      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Patriots win the Super Bowl - pegged to Polymarket'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )

      await userEvent.click(screen.getByRole('button', { name: /i'm taking no/i }))

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled()
      })
      const callArg = onCreate.mock.calls[0][0]
      expect(callArg.data.creatorIsYes).toBe(false)
    })

    it('rejects submit when no side is chosen', async () => {
      const onCreate = vi.fn()
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} initialPolymarketMarket={polymarketMarket} />,
        { chainId: 80002 }
      )

      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Patriots win the Super Bowl - pegged to Polymarket'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/pick which side/i)).toBeInTheDocument()
      })
      expect(onCreate).not.toHaveBeenCalled()
    })

    it('rejects submit when the linked Polymarket has already ended', async () => {
      const stale = {
        ...polymarketMarket,
        endDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }
      const onCreate = vi.fn()
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} initialPolymarketMarket={stale} />,
        { chainId: 80002 }
      )

      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Patriots win the Super Bowl - pegged to Polymarket'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('button', { name: /i'm taking yes/i }))

      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))

      await waitFor(() => {
        expect(screen.getByText(/already ended/i)).toBeInTheDocument()
      })
      expect(onCreate).not.toHaveBeenCalled()
    })

    it('picking a market via the inline PolymarketBrowser surfaces it as the selected market', async () => {
      // No initialPolymarketMarket — user picks via the (mocked) browser instead.
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} />,
        { chainId: 80002 }
      )

      // Switch resolution type to Polymarket (via the tab strip) so the inline
      // browser renders.
      await userEvent.click(screen.getByRole('tab', { name: /polymarket/i }))

      // Pick the (single) mocked market.
      await userEvent.click(screen.getByTestId(`pmb-pick-${polymarketMarket.conditionId}`))

      // After pick the modal collapses the browser and shows the picked market.
      // The selected-market panel renders the question text (same as in the seed test).
      await waitFor(() => {
        expect(screen.getByText(polymarketMarket.question)).toBeInTheDocument()
      })
    })
  })

  describe('Oracle-extensible wagers (ChainlinkDataFeed / Functions / UMA)', () => {
    // The picker hits ethers via the hook. We stub the picker itself at the
    // top of this file so these tests focus on modal wiring — the hook +
    // picker have their own unit tests.
    const STUB_CONDITION_ID = STUB_ORACLE_CONDITION_ID

    // Tab names in the resolution strip, keyed by oracle picker `kind`.
    const TAB_NAME = {
      datafeed: /chainlink data feed/i,
      functions: /chainlink functions/i,
      uma: /^uma$/i,
    }

    async function pickKindAndSide(kind, sideLabel) {
      // Switch to the desired oracle via the resolution-type tab strip.
      await userEvent.click(screen.getByRole('tab', { name: TAB_NAME[kind] }))
      // Click the stub picker's "Pick" button → conditionId lands in formData.
      await userEvent.click(await screen.findByTestId(`mock-pick-${kind}`))
      // Side picker: generic YES/NO buttons.
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`i'm taking ${sideLabel}`, 'i') }))
    }

    it('renders the 3 new oracle tabs on a Polygon-family chain', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />, { chainId: 80002 })
      expect(screen.getByRole('tab', { name: /chainlink data feed/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /chainlink functions/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^uma$/i })).toBeInTheDocument()
    })

    it('renders the picker + generic side picker for ChainlinkDataFeed', async () => {
      renderWithProviders(<FriendMarketsModal {...defaultProps} />, { chainId: 80002 })
      await userEvent.click(screen.getByRole('tab', { name: /chainlink data feed/i }))
      expect(await screen.findByTestId('mock-oracle-picker-datafeed')).toBeInTheDocument()
      // Generic YES/NO buttons.
      expect(screen.getByRole('button', { name: /I'm taking YES/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /I'm taking NO/i })).toBeInTheDocument()
    })

    it('forwards resolutionType=5 + oracleConditionId + creatorIsYes=true to onCreate (DataFeed YES)', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'wager-dfy' })
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} />,
        { chainId: 80002 }
      )
      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'ETH closes above 3000 by year end — Chainlink Data Feed test'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await pickKindAndSide('datafeed', 'YES')
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))
      await waitFor(() => expect(onCreate).toHaveBeenCalled())
      expect(onCreate.mock.calls[0][0].data).toEqual(expect.objectContaining({
        resolutionType: 5,
        oracleConditionId: STUB_CONDITION_ID,
        creatorIsYes: true,
      }))
    })

    it('forwards resolutionType=7 + creatorIsYes=false for UMA NO', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'wager-umano' })
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} />,
        { chainId: 80002 }
      )
      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'UMA assertion: Patriots win Super Bowl LX'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await pickKindAndSide('uma', 'NO')
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))
      await waitFor(() => expect(onCreate).toHaveBeenCalled())
      expect(onCreate.mock.calls[0][0].data).toEqual(expect.objectContaining({
        resolutionType: 7,
        oracleConditionId: STUB_CONDITION_ID,
        creatorIsYes: false,
      }))
    })

    it('rejects submit when no condition is picked', async () => {
      const onCreate = vi.fn()
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} />,
        { chainId: 80002 }
      )
      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Chainlink Functions: some custom request'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('tab', { name: /chainlink functions/i }))
      // Don't pick a condition — go straight to submit. Side stays empty too.
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))
      await waitFor(() => {
        expect(screen.getByText(/Pick \(or paste\) a registered conditionId/i)).toBeInTheDocument()
      })
      expect(onCreate).not.toHaveBeenCalled()
    })

    it('rejects submit when a condition is picked but no side is chosen', async () => {
      const onCreate = vi.fn()
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} />,
        { chainId: 80002 }
      )
      await userEvent.type(
        screen.getByLabelText(/what's the bet/i),
        'Chainlink Data Feed test — no side picked'
      )
      await userEvent.type(
        screen.getByLabelText(/opponent address/i),
        '0xabcdef1234567890123456789012345678901234'
      )
      await userEvent.click(screen.getByRole('tab', { name: /chainlink data feed/i }))
      await userEvent.click(await screen.findByTestId('mock-pick-datafeed'))
      // Don't click YES/NO.
      await userEvent.click(screen.getByRole('button', { name: /create wager/i }))
      await waitFor(() => {
        expect(screen.getByText(/Pick which side of the bet you are taking/i)).toBeInTheDocument()
      })
      expect(onCreate).not.toHaveBeenCalled()
    })

    it('clears oracleConditionId when switching between oracle types', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 'wager-switch' })
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} onCreate={onCreate} />,
        { chainId: 80002 }
      )
      // Pick a DataFeed condition first.
      await userEvent.click(screen.getByRole('tab', { name: /chainlink data feed/i }))
      await userEvent.click(await screen.findByTestId('mock-pick-datafeed'))
      // Switch to UMA → picker should reset (data-value attribute on the stub goes back to '').
      await userEvent.click(screen.getByRole('tab', { name: /^uma$/i }))
      const umaPicker = await screen.findByTestId('mock-oracle-picker-uma')
      expect(umaPicker).toHaveAttribute('data-value', '')
    })
  })

  describe('Transaction Progress', () => {
    it('should display pending transaction banner when pendingTransaction exists', () => {
      const pendingTransaction = {
        step: 'create',
        txHash: '0xabc123',
        timestamp: Date.now() - 60000,
        data: {
          description: 'Test pending market',
          opponent: '0xabcdef1234567890123456789012345678901234',
          stakeAmount: '10'
        }
      }
      renderWithProviders(
        <FriendMarketsModal {...defaultProps} pendingTransaction={pendingTransaction} />
      )

      expect(screen.getByText('Previous transaction in progress')).toBeInTheDocument()
    })

    it('should call onClearPendingTransaction when Start Fresh is clicked', async () => {
      const onClearPendingTransaction = vi.fn()
      const pendingTransaction = {
        step: 'create',
        txHash: '0xabc123',
        timestamp: Date.now() - 60000,
        data: {
          description: 'Test pending market',
          opponent: '0xabcdef1234567890123456789012345678901234',
          stakeAmount: '10'
        }
      }
      renderWithProviders(
        <FriendMarketsModal
          {...defaultProps}
          pendingTransaction={pendingTransaction}
          onClearPendingTransaction={onClearPendingTransaction}
        />
      )

      await userEvent.click(screen.getByText('Start Fresh'))

      expect(onClearPendingTransaction).toHaveBeenCalled()
    })
  })
})
