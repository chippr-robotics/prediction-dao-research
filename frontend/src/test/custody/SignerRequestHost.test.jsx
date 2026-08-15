// Spec 088 — the global deferred-ceremony host: renders the RIGHT dialog for a pending signer
// request, resolves the broker on success, cancels on dismiss, and fails a request for an
// account this device no longer has saved instead of showing a dialog over nothing.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../components/account/LegacyUnlockDialog', () => ({
  default: ({ open, entry, onUnlocked, onClose }) =>
    open ? (
      <div data-testid="unlock-dialog" data-address={entry?.address}>
        <button onClick={() => onUnlocked({ id: 'legacy-signer' })}>unlock</button>
        <button onClick={onClose}>dismiss</button>
      </div>
    ) : null,
}))
vi.mock('../../components/account/HardwareConnectDialog', () => ({
  default: ({ open, entry, onConnected, onClose }) =>
    open ? (
      <div data-testid="connect-dialog" data-address={entry?.address}>
        <button onClick={() => onConnected({ id: 'hw-signer' })}>connect</button>
        <button onClick={onClose}>dismiss</button>
      </div>
    ) : null,
}))

import SignerRequestHost from '../../components/account/SignerRequestHost'
import { CustodyContext } from '../../contexts/CustodyContext'
import { WalletContext } from '../../contexts/WalletContext'
import { hardwareWalletVault } from '../../lib/hardware/hardwareAccounts'
import { saveLegacyRecoveredKeys } from '../../lib/recovery/legacyRecoveredKeysStore'

const OWNER = '0x1111111111111111111111111111111111111111'
const LEGACY = '0x0e35000000000000000000000000000000000c0b'
const HW = '0xaaa0000000000000000000000000000000000001'

const renderHost = (custody) =>
  render(
    <WalletContext.Provider value={{ address: OWNER, chainId: 137 }}>
      <CustodyContext.Provider value={custody}>
        <SignerRequestHost />
      </CustodyContext.Provider>
    </WalletContext.Provider>,
  )

beforeEach(() => {
  localStorage.clear()
  saveLegacyRecoveredKeys(OWNER, { [LEGACY]: { address: LEGACY, ct: 'AAECAw', kind: 'privateKey', protection: 'passphrase', importedAt: 1 } })
  hardwareWalletVault(OWNER).add({ address: HW, vendor: 'ledger', path: "m/44'/60'/0'/0/0", label: 'Cold' })
})

describe('SignerRequestHost', () => {
  it('renders nothing without a pending request', () => {
    renderHost({ signerRequest: null })
    expect(screen.queryByTestId('unlock-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('connect-dialog')).not.toBeInTheDocument()
  })

  it('renders the unlock dialog for a legacy request and attaches on success', () => {
    const attachActingSigner = vi.fn()
    renderHost({ signerRequest: { mode: 'legacy', address: LEGACY }, attachActingSigner, cancelSignerRequest: vi.fn() })
    expect(screen.getByTestId('unlock-dialog')).toHaveAttribute('data-address', LEGACY)
    fireEvent.click(screen.getByText('unlock'))
    expect(attachActingSigner).toHaveBeenCalledWith({ id: 'legacy-signer' }, 137)
  })

  it('renders the device dialog for a hardware request and attaches on success', () => {
    const attachActingSigner = vi.fn()
    renderHost({ signerRequest: { mode: 'hardware', address: HW }, attachActingSigner, cancelSignerRequest: vi.fn() })
    expect(screen.getByTestId('connect-dialog')).toHaveAttribute('data-address', HW)
    fireEvent.click(screen.getByText('connect'))
    expect(attachActingSigner).toHaveBeenCalledWith({ id: 'hw-signer' }, 137)
  })

  it('cancels the pending action when the member dismisses the ceremony', () => {
    const cancelSignerRequest = vi.fn()
    renderHost({ signerRequest: { mode: 'legacy', address: LEGACY }, attachActingSigner: vi.fn(), cancelSignerRequest })
    fireEvent.click(screen.getByText('dismiss'))
    expect(cancelSignerRequest).toHaveBeenCalled()
  })

  it('fails a request for an account no longer saved on this device', () => {
    const cancelSignerRequest = vi.fn()
    renderHost({
      signerRequest: { mode: 'hardware', address: '0xbbb0000000000000000000000000000000000009' },
      attachActingSigner: vi.fn(),
      cancelSignerRequest,
    })
    expect(screen.queryByTestId('connect-dialog')).not.toBeInTheDocument()
    expect(cancelSignerRequest).toHaveBeenCalledWith(expect.stringMatching(/no longer saved/i))
  })
})
