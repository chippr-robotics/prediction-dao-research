import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ethers } from 'ethers'

const MY_ADDRESS = ethers.getAddress('0x5555555555555555555555555555555555555555')
const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const WETH1 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const walletHolder = { isConnected: true, address: MY_ADDRESS, openConnectModal: vi.fn() }
vi.mock('../hooks', () => ({
  useWallet: () => ({
    isConnected: walletHolder.isConnected,
    address: walletHolder.address,
    openConnectModal: walletHolder.openConnectModal,
  }),
}))

const effectiveHolder = { address: MY_ADDRESS, isActingAccount: false, label: null, type: null }
vi.mock('../hooks/useEffectiveAccount', () => ({ useEffectiveAccount: () => effectiveHolder }))

const nativeOpt = { key: '137:native', chainId: 137, kind: 'native', address: null, symbol: 'POL', name: 'Polygon', decimals: 18, networkName: 'Polygon', balance: 2 }
const stableOpt = { key: `137:${USDC.toLowerCase()}`, chainId: 137, kind: 'erc20', address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6, networkName: 'Polygon', balance: 100 }
const wethOpt = { key: `1:${WETH1.toLowerCase()}`, chainId: 1, kind: 'erc20', address: WETH1, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, networkName: 'Ethereum', balance: 3 }
const btcOpt = { key: 'bitcoin:native', chainId: 'bitcoin', kind: 'btc-native', address: null, symbol: 'BTC', name: 'Bitcoin', decimals: 8, networkName: 'Bitcoin', balance: 0.5 }
const selectableHolder = { options: [], defaultKey: null }
vi.mock('../hooks/useSelectableAssets', () => ({
  useSelectableAssets: () => ({ options: selectableHolder.options, defaultKey: selectableHolder.defaultKey, isGasless: () => false }),
  default: () => ({ options: selectableHolder.options, defaultKey: selectableHolder.defaultKey, isGasless: () => false }),
}))

const btcHolder = { status: 'idle', receive: { nextReceiveAddress: vi.fn(() => ({ address: 'bc1qexampleaddress' })) } }
vi.mock('../hooks/useBitcoinWallet', () => ({ useBitcoinWallet: () => btcHolder }))

const clipboardHolder = { copied: false, error: null, copy: vi.fn() }
vi.mock('../hooks/useClipboard', () => ({ useClipboard: () => clipboardHolder }))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props) => <svg data-testid="request-qr" data-value={props.value} role="img" aria-label={props['aria-label']} />,
}))

import RequestPanel from '../components/fairwins/RequestPanel'
import { buildPaymentRequestUri } from '../lib/payments/paymentRequest'

const typeAmount = (digits) => {
  for (const d of digits) {
    fireEvent.click(screen.getByRole('button', { name: d === '.' ? 'Decimal point' : d }))
  }
}
const requestButton = () => screen.getByRole('button', { name: /^request$/i })
const currencyTrigger = () => screen.getByRole('button', { name: 'Currency' })
const pickAsset = (name) => {
  fireEvent.click(currencyTrigger())
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name }))
}

describe('RequestPanel (spec 058 US2 + spec 064 US2)', () => {
  beforeEach(() => {
    localStorage.clear()
    walletHolder.isConnected = true
    walletHolder.address = MY_ADDRESS
    walletHolder.openConnectModal = vi.fn()
    Object.assign(effectiveHolder, { address: MY_ADDRESS, isActingAccount: false, label: null, type: null })
    clipboardHolder.copy = vi.fn()
    selectableHolder.options = [stableOpt, nativeOpt, wethOpt]
    selectableHolder.defaultKey = stableOpt.key
    Object.assign(btcHolder, { status: 'idle', receive: { nextReceiveAddress: vi.fn(() => ({ address: 'bc1qexampleaddress' })) } })
  })

  it('keeps Request disabled until an amount is entered', () => {
    render(<RequestPanel />)
    expect(requestButton()).toBeDisabled()
    typeAmount(['4'])
    expect(requestButton()).toBeEnabled()
  })

  it('lists receivable assets with their networks in the selector (spec 064 US2)', () => {
    render(<RequestPanel />)
    fireEvent.click(currencyTrigger())
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('option', { name: /USDC/ })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: /WETH/ })).toHaveTextContent('Ethereum')
  })

  it('opens the connect modal before a code can be generated', () => {
    walletHolder.isConnected = false
    walletHolder.address = null
    effectiveHolder.address = null
    render(<RequestPanel />)
    typeAmount(['4'])
    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }))
    expect(walletHolder.openConnectModal).toHaveBeenCalled()
  })

  it('generates a valid EIP-681 QR carrying address, amount, currency, network, and note', () => {
    render(<RequestPanel />)
    typeAmount(['1', '2', '.', '5'])
    fireEvent.change(screen.getByLabelText(/what's it for/i), { target: { value: 'pizza night' } })
    fireEvent.click(requestButton())
    const expected = buildPaymentRequestUri({
      chainId: 137, to: MY_ADDRESS, kind: 'stable', tokenAddress: USDC, decimals: 6, amount: '12.5', note: 'pizza night',
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('request-qr')).toHaveAttribute('data-value', expected)
    expect(screen.getByText('pizza night')).toBeInTheDocument()
  })

  it('generates a native-coin request when the native asset is selected', () => {
    render(<RequestPanel />)
    pickAsset(/POL/)
    typeAmount(['2'])
    fireEvent.click(requestButton())
    const expected = buildPaymentRequestUri({ chainId: 137, to: MY_ADDRESS, kind: 'native', decimals: 18, amount: '2' })
    expect(screen.getByTestId('request-qr')).toHaveAttribute('data-value', expected)
  })

  it('encodes the asset network for a cross-network asset (WETH on Ethereum) (spec 064 US2)', () => {
    render(<RequestPanel />)
    pickAsset(/WETH/)
    typeAmount(['1'])
    fireEvent.click(requestButton())
    const value = screen.getByTestId('request-qr').getAttribute('data-value')
    expect(value).toContain(`${WETH1}@1`) // token contract on chain 1
    expect(value).toContain('/transfer')
  })

  it('generates a BIP-21 bitcoin request against a fresh receive address (spec 064 US2)', () => {
    btcHolder.status = 'ready'
    selectableHolder.options = [stableOpt, nativeOpt, btcOpt]
    render(<RequestPanel />)
    pickAsset(/BTC/)
    typeAmount(['1'])
    fireEvent.click(requestButton())
    const value = screen.getByTestId('request-qr').getAttribute('data-value')
    expect(value).toMatch(/^bitcoin:bc1qexampleaddress/)
    expect(btcHolder.receive.nextReceiveAddress).toHaveBeenCalled()
  })

  it('copies the request URI from the modal', () => {
    render(<RequestPanel />)
    typeAmount(['3'])
    fireEvent.click(requestButton())
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(clipboardHolder.copy).toHaveBeenCalledWith(screen.getByTestId('request-qr').getAttribute('data-value'))
  })

  it('closes the QR modal, returning to the editable form', () => {
    render(<RequestPanel />)
    typeAmount(['3'])
    fireEvent.click(requestButton())
    expect(screen.getByTestId('request-qr')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close payment request/i }))
    expect(screen.queryByTestId('request-qr')).toBeNull()
    expect(requestButton()).toBeInTheDocument()
  })

  it('invalidates a generated request when the acting account changes (no stale payee)', () => {
    const { rerender } = render(<RequestPanel />)
    typeAmount(['5'])
    fireEvent.click(requestButton())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    effectiveHolder.address = ethers.getAddress('0x9999999999999999999999999999999999999999')
    rerender(<RequestPanel />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('request-qr')).toBeNull()
  })

  it('invalidates a generated request when the selected asset changes (FR-010)', () => {
    render(<RequestPanel />)
    typeAmount(['5'])
    fireEvent.click(requestButton())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    pickAsset(/POL/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
