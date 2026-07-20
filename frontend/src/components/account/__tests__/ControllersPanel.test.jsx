/**
 * Spec 041 T049 — ControllersPanel state machines (US4):
 * add-passkey (ceremony → self-call → PRF wrap), link-wallet with the
 * clarification-Q2 screening gate (flagged AND unscreenable both refuse,
 * fail-closed), remove with last-controller refusal, counterfactual gating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

let walletState
vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))

let accountState
vi.mock('../../../hooks/usePasskeyAccount', () => ({ usePasskeyAccount: () => accountState }))

vi.mock('../../../config/networks', () => ({ getNetwork: vi.fn(() => ({ capabilities: {} })) }))
vi.mock('../../../config/contracts', () => ({
  getContractAddress: vi.fn(),
  getContractAddressForChain: vi.fn(),
}))

import ControllersPanel from '../ControllersPanel'

const ACCOUNT = '0x00000000000000000000000000000000000A11CE'
const WALLET = '0x' + 'c'.repeat(40)

// Open the link-wallet consent sheet and click its confirm button. The panel
// button and the sheet's confirm button share the label "Link wallet", so the
// confirm is scoped to the dialog.
function confirmLink() {
  fireEvent.click(screen.getByRole('button', { name: /link wallet/i })) // panel → opens sheet
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /link wallet/i })) // confirm
}

function passkeyRow(i, extra = {}) {
  return {
    index: BigInt(i),
    ownerBytes: '0x' + `${i}`.repeat(128),
    kind: 'passkey',
    address: null,
    label: `Key ${i}`,
    credentialId: `cred-${i}`,
    isThisDevice: i === 0,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  walletState = { address: ACCOUNT, sendCalls: vi.fn(async () => ({ txHash: '0x1' })), provider: {} }
  accountState = {
    isPasskeySession: true,
    deployed: true,
    controllers: [passkeyRow(0), passkeyRow(1)],
    controllerCount: 2,
    singleControllerRisk: false,
    accountFlagged: false,
    encryption: { state: 'available' },
    error: null,
    refresh: vi.fn(),
  }
})

describe('ControllersPanel', () => {
  it('lists controllers and enables removal when more than one exists (FR-018/FR-020)', () => {
    render(<ControllersPanel />)
    expect(screen.getByTestId('controller-0')).toHaveTextContent('Key 0')
    expect(screen.getByTestId('controller-0')).toHaveTextContent('(this device)')
    expect(screen.getAllByRole('button', { name: /remove/i })[0]).toBeEnabled()
  })

  it('refuses last-controller removal in the UI (FR-020 client half)', () => {
    accountState = { ...accountState, controllers: [passkeyRow(0)], controllerCount: 1, singleControllerRisk: true }
    render(<ControllersPanel />)
    expect(screen.getByTestId('single-controller-warning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled()
  })

  it('shows an informed-consent sheet before linking, then links a CLEAR wallet through one sendCalls self-call (FR-019)', async () => {
    const screenController = vi.fn(async () => ({ clear: true, available: true }))
    render(<ControllersPanel deps={{ screenController }} />)
    fireEvent.change(screen.getByLabelText(/wallet address to link/i), { target: { value: WALLET } })
    // Opening the sheet alone must NOT act — the member has to confirm first.
    fireEvent.click(screen.getByRole('button', { name: /link wallet/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/full controller/i)
    expect(dialog).toHaveTextContent(WALLET)
    expect(screenController).not.toHaveBeenCalled()
    // Confirm inside the sheet performs the action.
    fireEvent.click(within(dialog).getByRole('button', { name: /link wallet/i }))
    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    expect(screenController).toHaveBeenCalledWith(WALLET, walletState.provider)
    expect(walletState.sendCalls.mock.calls[0][0][0].target).toBe(ACCOUNT) // self-call
  })

  it('REFUSES a flagged wallet before any on-chain op (clarification Q2)', async () => {
    const screenController = vi.fn(async () => ({ clear: false, available: true }))
    render(<ControllersPanel deps={{ screenController }} />)
    fireEvent.change(screen.getByLabelText(/wallet address to link/i), { target: { value: WALLET } })
    confirmLink()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/flagged/i))
    expect(walletState.sendCalls).not.toHaveBeenCalled()
  })

  it('REFUSES re-linking a wallet that is already a controller (spec 045, idempotent)', async () => {
    const screenController = vi.fn(async () => ({ clear: true, available: true }))
    accountState = {
      ...accountState,
      controllers: [passkeyRow(0), { index: 1n, ownerBytes: '0x' + '0'.repeat(24) + 'c'.repeat(40), kind: 'wallet', address: WALLET, label: 'Wallet', credentialId: null, isThisDevice: false }],
    }
    render(<ControllersPanel deps={{ screenController }} />)
    fireEvent.change(screen.getByLabelText(/wallet address to link/i), { target: { value: WALLET } })
    confirmLink()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already a controller/i))
    expect(screenController).not.toHaveBeenCalled()
    expect(walletState.sendCalls).not.toHaveBeenCalled()
  })

  it('REFUSES when screening is unavailable — fail-closed', async () => {
    const screenController = vi.fn(async () => ({ clear: false, available: false }))
    render(<ControllersPanel deps={{ screenController }} />)
    fireEvent.change(screen.getByLabelText(/wallet address to link/i), { target: { value: WALLET } })
    confirmLink()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/fail-closed/i))
    expect(walletState.sendCalls).not.toHaveBeenCalled()
  })

  it('shows an informed-consent sheet before adding a passkey, then runs the ceremony → ownerAdd self-call → refresh (FR-019)', async () => {
    const createCredential = vi.fn(async () => ({
      credentialId: 'cred-new',
      publicKey: { x: '0x' + '3'.repeat(64), y: '0x' + '4'.repeat(64) },
      prfCapable: true,
    }))
    render(<ControllersPanel deps={{ createCredential }} />)
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/full controller/i)
    expect(createCredential).not.toHaveBeenCalled() // opening the sheet doesn't act
    fireEvent.click(within(dialog).getByRole('button', { name: /create passkey/i }))
    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    expect(createCredential).toHaveBeenCalled()
    expect(accountState.refresh).toHaveBeenCalled()
  })

  it('gates mutations until the account is on-chain (counterfactual honesty, FR-007)', () => {
    accountState = { ...accountState, deployed: false, controllers: [], controllerCount: 0, singleControllerRisk: true }
    render(<ControllersPanel />)
    expect(screen.getByRole('note')).toHaveTextContent(/activates on-chain with your first action/i)
    expect(screen.getByRole('button', { name: /add a passkey/i })).toBeDisabled()
  })

  it('renders nothing for classic-wallet sessions (SC-004)', () => {
    accountState = { ...accountState, isPasskeySession: false }
    const { container } = render(<ControllersPanel />)
    expect(container.firstChild).toBeNull()
  })
})
