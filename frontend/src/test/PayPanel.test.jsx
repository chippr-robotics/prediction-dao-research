import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const RECIPIENT = '0x2222222222222222222222222222222222222222'
const BOOK_ADDR = '0x3333333333333333333333333333333333333333'

const walletHolder = { isConnected: true, openConnectModal: vi.fn() }
vi.mock('../hooks', () => ({
  useWallet: () => ({
    isConnected: walletHolder.isConnected,
    address: '0xabc',
    chainId: 137,
    openConnectModal: walletHolder.openConnectModal,
  }),
}))

const transferHolder = {}
const resetTransferHolder = () => {
  Object.assign(transferHolder, {
    status: 'idle',
    error: null,
    send: vi.fn(async () => ({ txHash: '0xhash', route: 'gasless', id: 't1' })),
    quoteGasless: () => true,
    balanceOf: (kind) => (kind === 'stable' ? '100' : '2'),
    refreshBalances: vi.fn(),
    tokens: {
      chainId: 137, networkName: 'Polygon',
      native: 'POL', nativeName: 'Polygon', nativeDecimals: 18,
      stable: 'USDC', stableName: 'USD Coin', stableAddress: USDC, stableDecimals: 6,
    },
  })
}
vi.mock('../hooks/useTransfer', () => ({
  useTransfer: () => transferHolder,
  TRANSFER_KIND: { NATIVE: 'native', STABLE: 'stable' },
}))

const screeningHolder = { result: 'clear' }
vi.mock('../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({ screenOne: vi.fn(async () => screeningHolder.result) }),
}))

const notifyHolder = { showNotification: vi.fn() }
vi.mock('../hooks/useUI', () => ({ useNotification: () => notifyHolder }))

const switchHolder = { switchChainAsync: vi.fn(async () => {}), isPending: false }
vi.mock('wagmi', () => ({ useSwitchChain: () => switchHolder }))

// Standard address entry stack, stubbed: the input reports raw changes and
// resolves anything address-shaped; book + scanner surface their callbacks.
vi.mock('../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange, onResolvedChange, disabled }) => (
    <input
      id={id}
      aria-label="To"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e)
        onResolvedChange(/^0x[0-9a-fA-F]{40}$/.test(e.target.value) ? e.target.value : '')
      }}
    />
  ),
}))
vi.mock('../components/ui/AddressBookButton', () => ({
  default: ({ onSelect, disabled }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect({ address: BOOK_ADDR })}>
      book pick
    </button>
  ),
}))
const scanHolder = { payload: '' }
vi.mock('../components/ui/QRScanner', () => ({
  default: ({ isOpen, onScanSuccess }) => isOpen ? (
    <button type="button" onClick={() => onScanSuccess(scanHolder.payload)}>simulate scan</button>
  ) : null,
}))

import PayPanel from '../components/fairwins/PayPanel'

const typeAmount = (digits) => {
  for (const d of digits) {
    fireEvent.click(screen.getByRole('button', { name: d === '.' ? 'Decimal point' : d }))
  }
}
const setRecipient = (addr) => fireEvent.change(screen.getByLabelText('To'), { target: { value: addr } })
const payButton = () => screen.getByRole('button', { name: /^pay$/i })
const scanWith = (payload) => {
  scanHolder.payload = payload
  fireEvent.click(screen.getByRole('button', { name: /scan qr code/i }))
  fireEvent.click(screen.getByRole('button', { name: /simulate scan/i }))
}

describe('PayPanel (spec 058 US1)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetTransferHolder()
    walletHolder.isConnected = true
    walletHolder.openConnectModal = vi.fn()
    screeningHolder.result = 'clear'
    notifyHolder.showNotification = vi.fn()
    switchHolder.switchChainAsync = vi.fn(async () => {})
  })

  it('defaults the hero to the stablecoin (USDC) and shows honest symbols in the currency dropdown', () => {
    render(<PayPanel />)
    const select = screen.getByLabelText('Currency')
    expect(select).toHaveValue('stable')
    expect(screen.getByRole('option', { name: 'USDC' }).selected).toBe(true)
    fireEvent.change(select, { target: { value: 'native' } })
    expect(screen.getByRole('option', { name: 'POL' }).selected).toBe(true)
  })

  it('starts on the preferred currency kind from the device preference', async () => {
    const { setDefaultCurrencyKind } = await import('../utils/homePreference')
    setDefaultCurrencyKind('native')
    render(<PayPanel />)
    expect(screen.getByLabelText('Currency')).toHaveValue('native')
  })

  it('keeps Pay disabled at zero amount and without a resolved recipient (FR-005)', async () => {
    render(<PayPanel />)
    expect(payButton()).toBeDisabled()
    typeAmount(['5'])
    expect(payButton()).toBeDisabled() // amount but no recipient
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    setRecipient('not-an-address')
    expect(payButton()).toBeDisabled()
  })

  it('blocks an amount above the balance with a clear reason (FR-005)', async () => {
    render(<PayPanel />)
    setRecipient(RECIPIENT)
    typeAmount(['9', '9', '9'])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/more USDC than you have/i))
    expect(payButton()).toBeDisabled()
  })

  it('blocks a screening-restricted recipient (FR-005)', async () => {
    screeningHolder.result = 'restricted'
    render(<PayPanel />)
    typeAmount(['5'])
    setRecipient(RECIPIENT)
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/sanctions screening/i))
    expect(payButton()).toBeDisabled()
  })

  it('opens the connect modal instead of Pay when disconnected', () => {
    walletHolder.isConnected = false
    render(<PayPanel />)
    const connect = screen.getByRole('button', { name: /connect wallet/i })
    fireEvent.click(connect)
    expect(walletHolder.openConnectModal).toHaveBeenCalled()
  })

  it('prefills the recipient from an address-book pick', () => {
    render(<PayPanel />)
    fireEvent.click(screen.getByRole('button', { name: /book pick/i }))
    expect(screen.getByLabelText('To')).toHaveValue(BOOK_ADDR)
  })

  it('pays through the existing transfer engine after an honest fee confirm (FR-004)', async () => {
    render(<PayPanel />)
    typeAmount(['1', '2', '.', '5'])
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    fireEvent.click(payButton())
    // Confirm step disclosing amount, network, and the gasless fee line.
    const confirm = screen.getByTestId('pay-confirm')
    expect(confirm).toHaveTextContent('12.5 USDC')
    expect(confirm).toHaveTextContent('Polygon')
    expect(confirm).toHaveTextContent(/gasless — no network fee/i)
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(transferHolder.send).toHaveBeenCalledWith({ kind: 'stable', to: RECIPIENT, amount: '12.5' }))
    expect(notifyHolder.showNotification).toHaveBeenCalledWith(expect.stringMatching(/sent 12\.5 USDC/i), 'success')
    // Draft cleared after success.
    await waitFor(() => expect(screen.getByLabelText('To')).toHaveValue(''))
  })

  it('discloses a user-paid fee honestly when the route is not gasless', async () => {
    transferHolder.quoteGasless = () => false
    render(<PayPanel />)
    typeAmount(['5'])
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    fireEvent.click(payButton())
    expect(screen.getByTestId('pay-confirm')).toHaveTextContent(/you pay the POL network fee/i)
  })

  it('surfaces a send failure and returns to the editable form', async () => {
    transferHolder.send = vi.fn(async () => { throw new Error('relay exploded') })
    render(<PayPanel />)
    typeAmount(['5'])
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    fireEvent.click(payButton())
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('relay exploded'))
    expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
  })

  describe('QR scanning (FR-008/FR-009/FR-016)', () => {
    it('prefills recipient, amount, currency, and note from a full payment request', () => {
      render(<PayPanel />)
      scanWith(`ethereum:${USDC}@137/transfer?address=${RECIPIENT}&uint256=12500000&message=pizza%20night`)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('12.5')
      expect(screen.getByLabelText('Currency')).toHaveValue('stable')
      expect(screen.getByLabelText('Note')).toHaveValue('pizza night')
    })

    it('prefills only the recipient from a plain address QR (FR-009)', () => {
      render(<PayPanel />)
      typeAmount(['7'])
      scanWith(RECIPIENT)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('7')
    })

    it('rejects a foreign-token request with NO partial prefill (wrong-asset edge case)', () => {
      render(<PayPanel />)
      scanWith(`ethereum:0x4444444444444444444444444444444444444444@137/transfer?address=${RECIPIENT}&uint256=1000000`)
      expect(screen.getByText(/doesn't send on that network/i)).toBeInTheDocument()
      expect(screen.getByLabelText('To')).toHaveValue('')
      expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('0')
    })

    it('reports an unusable code without crashing', () => {
      render(<PayPanel />)
      scanWith('utter garbage')
      expect(screen.getByText(/isn't a payment request or address/i)).toBeInTheDocument()
    })

    it('surfaces a network mismatch with a switch affordance before any send (FR-016)', async () => {
      render(<PayPanel />)
      // A native request pinned to Ethereum mainnet while connected to Polygon.
      scanWith(`ethereum:${RECIPIENT}@1?value=1000000000000000000`)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      const switchBtn = screen.getByRole('button', { name: /switch to .* to pay this request/i })
      expect(screen.queryByRole('button', { name: /^pay$/i })).toBeNull()
      fireEvent.click(switchBtn)
      await waitFor(() => expect(switchHolder.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 }))
    })
  })
})
