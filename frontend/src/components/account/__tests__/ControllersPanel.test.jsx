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

// The panel is a COLLAPSED accordion section on the Recovery tab, so every test
// that touches an in-body control opens the section first — the same order a
// member does it in. (jsdom does not enforce `inert`, so a test that skipped the
// expand would pass here and fail in a browser.)
function renderPanel(props = {}) {
  const utils = render(<ControllersPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /devices & controllers/i }))
  return utils
}

// The address entry lives INSIDE the link sheet: the panel's "Link a wallet"
// button opens it, the address is typed there, and the sheet's "Link wallet"
// button confirms. Queries are scoped to the dialog throughout.
function openLinkSheet(address = WALLET) {
  fireEvent.click(screen.getByRole('button', { name: /link a wallet/i })) // panel → opens sheet
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/wallet address to link/i), { target: { value: address } })
  return dialog
}

function confirmLink() {
  const dialog = openLinkSheet()
  fireEvent.click(within(dialog).getByRole('button', { name: /^link wallet$/i })) // confirm
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
    renderPanel()
    expect(screen.getByTestId('controller-0')).toHaveTextContent('Key 0')
    expect(screen.getByTestId('controller-0')).toHaveTextContent('(this device)')
    expect(screen.getAllByRole('button', { name: /remove/i })[0]).toBeEnabled()
  })

  it('refuses last-controller removal in the UI (FR-020 client half)', () => {
    accountState = { ...accountState, controllers: [passkeyRow(0)], controllerCount: 1, singleControllerRisk: true }
    renderPanel()
    expect(screen.getByTestId('single-controller-warning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled()
  })

  it('shows an informed-consent sheet before linking, then links a CLEAR wallet through one sendCalls self-call (FR-019)', async () => {
    const screenController = vi.fn(async () => ({ clear: true, available: true }))
    renderPanel({ deps: { screenController } })
    // Opening the sheet and typing an address must NOT act — the member has to confirm first.
    const dialog = openLinkSheet()
    expect(dialog).toHaveTextContent(/full controller/i)
    expect(dialog).toHaveTextContent(WALLET)
    expect(screenController).not.toHaveBeenCalled()
    // Confirm inside the sheet performs the action.
    fireEvent.click(within(dialog).getByRole('button', { name: /^link wallet$/i }))
    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    expect(screenController).toHaveBeenCalledWith(WALLET, walletState.provider)
    expect(walletState.sendCalls.mock.calls[0][0][0].target).toBe(ACCOUNT) // self-call
  })

  it('REFUSES a flagged wallet before any on-chain op (clarification Q2)', async () => {
    const screenController = vi.fn(async () => ({ clear: false, available: true }))
    renderPanel({ deps: { screenController } })
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
    renderPanel({ deps: { screenController } })
    confirmLink()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already a controller/i))
    expect(screenController).not.toHaveBeenCalled()
    expect(walletState.sendCalls).not.toHaveBeenCalled()
  })

  it('REFUSES when screening is unavailable — fail-closed', async () => {
    const screenController = vi.fn(async () => ({ clear: false, available: false }))
    renderPanel({ deps: { screenController } })
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
    renderPanel({ deps: { createCredential } })
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/full controller/i)
    expect(createCredential).not.toHaveBeenCalled() // opening the sheet doesn't act
    fireEvent.click(within(dialog).getByRole('button', { name: /create passkey/i }))
    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    expect(createCredential).toHaveBeenCalled()
    expect(accountState.refresh).toHaveBeenCalled()
  })

  it('confirms in a sheet before removing a controller — the Remove button alone never acts', async () => {
    renderPanel()
    fireEvent.click(screen.getAllByRole('button', { name: /remove key 1/i })[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/no longer be able to approve actions/i)
    expect(walletState.sendCalls).not.toHaveBeenCalled()
    // Backing out leaves the controller alone.
    fireEvent.click(within(dialog).getByRole('button', { name: /keep it/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(walletState.sendCalls).not.toHaveBeenCalled()
    // Confirming performs the self-call.
    fireEvent.click(screen.getAllByRole('button', { name: /remove key 1/i })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /remove controller/i }))
    await waitFor(() => expect(walletState.sendCalls).toHaveBeenCalledTimes(1))
    expect(walletState.sendCalls.mock.calls[0][0][0].target).toBe(ACCOUNT) // self-call
  })

  it('summarises the controller count while collapsed, and flags a single-controller account', () => {
    const { unmount } = render(<ControllersPanel />)
    expect(screen.getByRole('button', { name: /devices & controllers/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('2 controllers')).toBeInTheDocument()
    unmount()

    accountState = { ...accountState, controllers: [passkeyRow(0)], controllerCount: 1, singleControllerRisk: true }
    render(<ControllersPanel />)
    expect(screen.getByText('1 controller')).toBeInTheDocument()
    expect(screen.getByText('Add a backup key')).toBeInTheDocument()
  })

  it('gates mutations until the account is on-chain (counterfactual honesty, FR-007)', () => {
    accountState = { ...accountState, deployed: false, controllers: [], controllerCount: 0, singleControllerRisk: true }
    renderPanel()
    expect(screen.getByRole('note')).toHaveTextContent(/activates on-chain with your first action/i)
    expect(screen.getByRole('button', { name: /add a passkey/i })).toBeDisabled()
  })

  it('renders nothing for classic-wallet sessions (SC-004)', () => {
    accountState = { ...accountState, isPasskeySession: false }
    const { container } = render(<ControllersPanel />)
    expect(container.firstChild).toBeNull()
  })
})
