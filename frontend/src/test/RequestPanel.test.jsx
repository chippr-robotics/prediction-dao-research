import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ethers } from 'ethers'

const MY_ADDRESS = ethers.getAddress('0x5555555555555555555555555555555555555555')
const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

const walletHolder = { isConnected: true, address: MY_ADDRESS, connectWallet: vi.fn() }
vi.mock('../hooks', () => ({
  useWallet: () => ({ isConnected: walletHolder.isConnected, address: walletHolder.address }),
  useWalletConnection: () => ({ connectWallet: walletHolder.connectWallet }),
}))

const tokensHolder = {}
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: () => tokensHolder }))

const clipboardHolder = { copied: false, copy: vi.fn() }
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

describe('RequestPanel (spec 058 US2)', () => {
  beforeEach(() => {
    localStorage.clear()
    walletHolder.isConnected = true
    walletHolder.address = MY_ADDRESS
    walletHolder.connectWallet = vi.fn()
    clipboardHolder.copied = false
    clipboardHolder.copy = vi.fn()
    Object.assign(tokensHolder, {
      chainId: 137, networkName: 'Polygon',
      native: 'POL', nativeDecimals: 18,
      stable: 'USDC', stableAddress: USDC, stableDecimals: 6,
    })
  })

  it('keeps Request disabled until an amount is entered', () => {
    render(<RequestPanel />)
    expect(requestButton()).toBeDisabled()
    typeAmount(['4'])
    expect(requestButton()).toBeEnabled()
  })

  it('prompts to connect before a code can be generated (US2 scenario 4)', () => {
    walletHolder.isConnected = false
    walletHolder.address = null
    render(<RequestPanel />)
    typeAmount(['4'])
    const connect = screen.getByRole('button', { name: /connect wallet/i })
    fireEvent.click(connect)
    expect(walletHolder.connectWallet).toHaveBeenCalled()
  })

  it('generates a valid EIP-681 QR carrying address, amount, currency, network, and note (FR-006/FR-007)', () => {
    render(<RequestPanel />)
    typeAmount(['1', '2', '.', '5'])
    fireEvent.change(screen.getByLabelText(/what's it for/i), { target: { value: 'pizza night' } })
    fireEvent.click(requestButton())
    const expected = buildPaymentRequestUri({
      chainId: 137, to: MY_ADDRESS, kind: 'stable', tokenAddress: USDC, decimals: 6, amount: '12.5', note: 'pizza night',
    })
    expect(screen.getByTestId('request-qr')).toHaveAttribute('data-value', expected)
    // The note is ALSO plain text beside the code (third-party wallets ignore the param).
    expect(screen.getByText('pizza night')).toBeInTheDocument()
  })

  it('generates a native-coin request when the currency pill is on the native kind', () => {
    render(<RequestPanel />)
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'native' } })
    typeAmount(['2'])
    fireEvent.click(requestButton())
    const expected = buildPaymentRequestUri({
      chainId: 137, to: MY_ADDRESS, kind: 'native', decimals: 18, amount: '2',
    })
    expect(screen.getByTestId('request-qr')).toHaveAttribute('data-value', expected)
  })

  it('copies the request URI', () => {
    render(<RequestPanel />)
    typeAmount(['3'])
    fireEvent.click(requestButton())
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(clipboardHolder.copy).toHaveBeenCalledWith(screen.getByTestId('request-qr').getAttribute('data-value'))
  })

  it('shares via the clipboard fallback when the Web Share API is unavailable (FR-007)', () => {
    render(<RequestPanel />)
    typeAmount(['3'])
    fireEvent.click(requestButton())
    fireEvent.click(screen.getByRole('button', { name: /share/i }))
    expect(clipboardHolder.copy).toHaveBeenCalledWith(expect.stringContaining('Pay me 3 USDC'))
    expect(clipboardHolder.copy).toHaveBeenCalledWith(expect.stringContaining('ethereum:'))
  })

  it('clears a displayed code the moment any input changes (stale-QR prevention)', () => {
    render(<RequestPanel />)
    typeAmount(['3'])
    fireEvent.click(requestButton())
    expect(screen.getByTestId('request-qr')).toBeInTheDocument()
    typeAmount(['0'])
    expect(screen.queryByTestId('request-qr')).toBeNull()
  })

  it('blocks a stablecoin request honestly when the network has none configured', () => {
    tokensHolder.stableAddress = null
    tokensHolder.stable = 'USC'
    render(<RequestPanel />)
    typeAmount(['3'])
    expect(screen.getByRole('alert')).toHaveTextContent(/no USC is configured/i)
    expect(requestButton()).toBeDisabled()
  })
})
