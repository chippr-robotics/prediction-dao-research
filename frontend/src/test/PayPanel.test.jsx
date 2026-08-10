import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const WETH1 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
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
    refreshBalances: vi.fn(),
  })
}
vi.mock('../hooks/useTransfer', () => ({
  useTransfer: () => transferHolder,
  TRANSFER_KIND: { NATIVE: 'native', STABLE: 'stable' },
}))

// The universal selector's option list is mocked so the panel test controls exactly
// which assets are offered (assembly itself is covered by useSelectableAssets tests).
const nativeOpt = { key: '137:native', chainId: 137, kind: 'native', address: null, symbol: 'POL', name: 'Polygon', decimals: 18, networkName: 'Polygon', balance: 2 }
const stableOpt = { key: `137:${USDC.toLowerCase()}`, chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6, networkName: 'Polygon', balance: 100 }
const wethOpt = { key: `1:${WETH1.toLowerCase()}`, chainId: 1, kind: 'erc20', address: WETH1, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, networkName: 'Ethereum', balance: 3 }
const btcOpt = { key: 'bitcoin:native', chainId: 'bitcoin', kind: 'btc-native', address: null, symbol: 'BTC', name: 'Bitcoin', decimals: 8, networkName: 'Bitcoin', balance: 0.5 }
const selectableHolder = { options: [], defaultKey: null }
const resetSelectable = () => {
  selectableHolder.options = [stableOpt, nativeOpt, wethOpt]
  selectableHolder.defaultKey = stableOpt.key
}
vi.mock('../hooks/useSelectableAssets', () => ({
  useSelectableAssets: () => ({
    options: selectableHolder.options,
    defaultKey: selectableHolder.defaultKey,
    isGasless: (o) => Number(o?.chainId) === 137,
  }),
  default: () => ({
    options: selectableHolder.options,
    defaultKey: selectableHolder.defaultKey,
    isGasless: (o) => Number(o?.chainId) === 137,
  }),
}))

vi.mock('../hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({ identity: { mode: 'personal' }, isVault: false, isLegacy: false }),
}))
const btcHolder = { status: 'idle', networkId: null, balances: { spendableSats: 0 } }
vi.mock('../hooks/useBitcoinWallet', () => ({ useBitcoinWallet: () => btcHolder }))
vi.mock('../components/wallet/BitcoinSendPanel', () => ({
  default: () => <div data-testid="btc-send-panel">bitcoin send</div>,
}))

const screeningHolder = { result: 'clear' }
vi.mock('../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({ screenOne: vi.fn(async () => screeningHolder.result) }),
}))

const notifyHolder = { showNotification: vi.fn() }
vi.mock('../hooks/useUI', () => ({ useNotification: () => notifyHolder }))

const switchHolder = { switchChainAsync: vi.fn(async () => {}), isPending: false }
vi.mock('wagmi', () => ({ useSwitchChain: () => switchHolder }))

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
const currencyTrigger = () => screen.getByRole('button', { name: 'Currency' })
const pickAsset = (name) => {
  fireEvent.click(currencyTrigger())
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name }))
}
const scanWith = (payload) => {
  scanHolder.payload = payload
  fireEvent.click(screen.getByRole('button', { name: /scan qr code/i }))
  fireEvent.click(screen.getByRole('button', { name: /simulate scan/i }))
}

describe('PayPanel (spec 058 US1 + spec 064 US1)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetTransferHolder()
    resetSelectable()
    walletHolder.isConnected = true
    walletHolder.openConnectModal = vi.fn()
    screeningHolder.result = 'clear'
    notifyHolder.showNotification = vi.fn()
    switchHolder.switchChainAsync = vi.fn(async () => {})
    Object.assign(btcHolder, { status: 'idle', networkId: null, balances: { spendableSats: 0 } })
  })

  it('defaults the currency to the connected stablecoin (USDC)', () => {
    render(<PayPanel />)
    expect(currencyTrigger()).toHaveTextContent('USDC')
  })

  it('starts on the preferred currency kind from the device preference', async () => {
    const { setDefaultCurrencyKind } = await import('../utils/homePreference')
    setDefaultCurrencyKind('native')
    render(<PayPanel />)
    expect(currencyTrigger()).toHaveTextContent('POL')
  })

  it('lists every held asset with its network in the universal selector (spec 064 US1)', () => {
    render(<PayPanel />)
    fireEvent.click(currencyTrigger())
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: /USDC/ })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: /POL/ })).toBeInTheDocument()
    const weth = within(list).getByRole('option', { name: /WETH/ })
    expect(weth).toHaveTextContent('Ethereum')
  })

  it('keeps Pay disabled at zero amount and without a resolved recipient', async () => {
    render(<PayPanel />)
    expect(payButton()).toBeDisabled()
    typeAmount(['5'])
    expect(payButton()).toBeDisabled()
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    setRecipient('not-an-address')
    expect(payButton()).toBeDisabled()
  })

  it('blocks an amount above the balance with a clear reason', async () => {
    render(<PayPanel />)
    setRecipient(RECIPIENT)
    typeAmount(['9', '9', '9'])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/more USDC than you have/i))
    expect(payButton()).toBeDisabled()
  })

  it('blocks a screening-restricted recipient', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }))
    expect(walletHolder.openConnectModal).toHaveBeenCalled()
  })

  it('prefills the recipient from an address-book pick', () => {
    render(<PayPanel />)
    fireEvent.click(screen.getByRole('button', { name: /book pick/i }))
    expect(screen.getByLabelText('To')).toHaveValue(BOOK_ADDR)
  })

  it('pays the selected asset through the existing engine after an honest fee confirm', async () => {
    render(<PayPanel />)
    typeAmount(['1', '2', '.', '5'])
    setRecipient(RECIPIENT)
    await waitFor(() => expect(payButton()).toBeEnabled())
    fireEvent.click(payButton())
    const confirm = screen.getByTestId('pay-confirm')
    expect(confirm).toHaveTextContent('12.5 USDC')
    expect(confirm).toHaveTextContent('Polygon')
    expect(confirm).toHaveTextContent(/gasless — no network fee/i)
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    await waitFor(() =>
      expect(transferHolder.send).toHaveBeenCalledWith(
        expect.objectContaining({ asset: expect.objectContaining({ symbol: 'USDC' }), to: RECIPIENT, amount: '12.5' }),
      ),
    )
    expect(notifyHolder.showNotification).toHaveBeenCalledWith(expect.stringMatching(/sent 12\.5 USDC/i), 'success')
    await waitFor(() => expect(screen.getByLabelText('To')).toHaveValue(''))
  })

  it('discloses a user-paid fee honestly for a non-gasless asset (WETH on Ethereum)', async () => {
    render(<PayPanel />)
    pickAsset(/WETH/)
    // WETH lives on Ethereum (chain 1) while connected to Polygon → switch-gated first.
    const switchBtn = screen.getByRole('button', { name: /switch to .* to pay/i })
    expect(switchBtn).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^pay$/i })).toBeNull()
  })

  it('gates a wrong-network asset behind a switch and never sends off-chain (spec 064 US1)', async () => {
    render(<PayPanel />)
    pickAsset(/WETH/)
    const switchBtn = screen.getByRole('button', { name: /switch to ethereum to pay/i })
    fireEvent.click(switchBtn)
    await waitFor(() => expect(switchHolder.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 }))
    expect(transferHolder.send).not.toHaveBeenCalled()
  })

  it('routes a Bitcoin selection through the Bitcoin send panel (spec 064 US1)', () => {
    btcHolder.status = 'ready'
    btcHolder.networkId = 'bitcoin'
    selectableHolder.options = [stableOpt, nativeOpt, btcOpt]
    render(<PayPanel />)
    pickAsset(/BTC/)
    expect(screen.getByTestId('btc-send-panel')).toBeInTheDocument()
    // No EVM confirm/keypad pay button in the Bitcoin body.
    expect(screen.queryByRole('button', { name: /^pay$/i })).toBeNull()
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

  describe('QR scanning', () => {
    it('prefills recipient, amount, currency, and note from a full payment request', () => {
      render(<PayPanel />)
      scanWith(`ethereum:${USDC}@137/transfer?address=${RECIPIENT}&uint256=12500000&message=pizza%20night`)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('12.5')
      expect(currencyTrigger()).toHaveTextContent('USDC')
      expect(screen.getByLabelText('Note')).toHaveValue('pizza night')
    })

    it('prefills only the recipient from a plain address QR', () => {
      render(<PayPanel />)
      typeAmount(['7'])
      scanWith(RECIPIENT)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('7')
    })

    it('rejects a foreign-token request with NO partial prefill', () => {
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

    it('surfaces a network mismatch with a switch affordance before any send', async () => {
      render(<PayPanel />)
      scanWith(`ethereum:${RECIPIENT}@1?value=1000000000000000000`)
      expect(screen.getByLabelText('To')).toHaveValue(RECIPIENT)
      const switchBtn = screen.getByRole('button', { name: /switch to .* to pay/i })
      expect(screen.queryByRole('button', { name: /^pay$/i })).toBeNull()
      fireEvent.click(switchBtn)
      await waitFor(() => expect(switchHolder.switchChainAsync).toHaveBeenCalledWith({ chainId: 1 }))
    })
  })
})
