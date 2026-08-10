// Spec 063 (US1, T012) — the fund-safety property: a payment Request is addressed to the account the
// member is ACTING AS (a vault), never the connected wallet. Guards SC-002 (no receiving to the wrong
// account). Renders the real RequestPanel + real buildPaymentRequestUri, driving the acting account via
// CustodyContext (which useEffectiveAccount reads directly).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Spec 064: stub the asset-selector data hook so this provider-light test stays isolated.
vi.mock('../../hooks/useSelectableAssets', async () => await import('../helpers/selectableAssetsMock'))
vi.mock('../../hooks/useBitcoinWallet', () => ({
  useBitcoinWallet: () => ({ status: 'idle', receive: { nextReceiveAddress: () => null } }),
}))
import { ethers } from 'ethers'
import { CustodyContext } from '../../contexts/CustodyContext'

const CONNECTED = ethers.getAddress('0x5555555555555555555555555555555555555555')
const VAULT = ethers.getAddress('0x1111111111111111111111111111111111111111')
const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

vi.mock('../../hooks', () => ({
  useWallet: () => ({ isConnected: true, address: CONNECTED, openConnectModal: vi.fn() }),
}))
const tokensHolder = {
  chainId: 137, networkName: 'Polygon', native: 'POL', nativeDecimals: 18,
  stable: 'USDC', stableAddress: USDC, stableDecimals: 6,
}
vi.mock('../../hooks/useChainTokens', () => ({ useChainTokens: () => tokensHolder }))
vi.mock('../../hooks/useClipboard', () => ({ useClipboard: () => ({ copied: false, error: null, copy: vi.fn() }) }))
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props) => <svg data-testid="request-qr" data-value={props.value} role="img" aria-label={props['aria-label']} />,
}))

import RequestPanel from '../../components/fairwins/RequestPanel'

const typeAmount = (digits) => {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d === '.' ? 'Decimal point' : d }))
}
const renderActingAs = (active) =>
  render(
    <CustodyContext.Provider value={{ active }}>
      <RequestPanel />
    </CustodyContext.Provider>,
  )

describe('RequestPanel — acting account (spec 063 US1)', () => {
  beforeEach(() => localStorage.clear())

  it('addresses the request to the ACTING vault, not the connected wallet', () => {
    renderActingAs({ mode: 'vault', vaultAddress: VAULT, chainId: 137, label: 'Team' })
    typeAmount('5')
    fireEvent.click(screen.getByRole('button', { name: /^request$/i }))
    const uri = screen.getByTestId('request-qr').getAttribute('data-value')
    expect(uri.toLowerCase()).toContain(VAULT.toLowerCase())
    expect(uri.toLowerCase()).not.toContain(CONNECTED.toLowerCase())
    // And the panel discloses who receives.
    expect(screen.getByText(/Paid to your multisig/i)).toBeInTheDocument()
  })

  it('addresses the request to the connected wallet when acting as personal', () => {
    renderActingAs({ mode: 'personal' })
    typeAmount('5')
    fireEvent.click(screen.getByRole('button', { name: /^request$/i }))
    const uri = screen.getByTestId('request-qr').getAttribute('data-value')
    expect(uri.toLowerCase()).toContain(CONNECTED.toLowerCase())
    expect(screen.queryByText(/Paid to your/i)).not.toBeInTheDocument()
  })
})
