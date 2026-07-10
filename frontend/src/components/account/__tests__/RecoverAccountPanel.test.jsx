/**
 * Spec 045 US6 — wallet-only recovery: isOwnerAddress gate (never offers the
 * ceremony to a non-controller wallet), happy path (create passkey →
 * addOwnerPublicKey via the wallet signer → receipt → book record), failure
 * honesty, and session gating (wallet sessions only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockWallet = {
  address: '0x' + 'e'.repeat(40),
  signer: {},
  provider: {},
  loginMethod: 'injected',
  isConnected: true,
}
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet,
}))

// ethers.Contract double — per-test behavior via these fns.
const { isOwnerAddress, addOwnerPublicKey, txWait } = vi.hoisted(() => ({
  isOwnerAddress: vi.fn(),
  addOwnerPublicKey: vi.fn(),
  txWait: vi.fn(),
}))
vi.mock('ethers', () => ({
  ethers: {
    Contract: class {
      constructor(target) {
        this.target = target
        this.isOwnerAddress = isOwnerAddress
        this.addOwnerPublicKey = addOwnerPublicKey
      }
    },
  },
}))

import RecoverAccountPanel from '../RecoverAccountPanel'
import { knownCredentials } from '../../../lib/passkey/credentials'

const ACCOUNT = '0x' + 'a'.repeat(40)
const PUBLIC_KEY = { x: `0x${'1'.repeat(64)}`, y: `0x${'2'.repeat(64)}` }

const createCredential = vi.fn().mockResolvedValue({
  credentialId: 'cred-new',
  publicKey: PUBLIC_KEY,
  prfCapable: true,
  label: 'Recovered device',
})

async function enterAndVerify(user) {
  await user.type(screen.getByLabelText('Passkey account address'), ACCOUNT)
  await user.click(screen.getByText('Verify ownership'))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockWallet.loginMethod = 'injected'
  mockWallet.isConnected = true
  isOwnerAddress.mockResolvedValue(true)
  txWait.mockResolvedValue({ status: 1 })
  addOwnerPublicKey.mockResolvedValue({ wait: txWait })
})

describe('RecoverAccountPanel', () => {
  it('renders only for connected wallet (non-passkey) sessions', () => {
    mockWallet.loginMethod = 'passkey'
    const { container } = render(<RecoverAccountPanel deps={{ createCredential }} />)
    expect(container.firstChild).toBeNull()
  })

  it('refuses recovery when the wallet is not a controller of the account', async () => {
    isOwnerAddress.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={{ createCredential }} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not a controller/i))
    expect(screen.getByText('Create & authorize new passkey')).toBeDisabled()
    expect(createCredential).not.toHaveBeenCalled()
  })

  it('recovers end-to-end: verify → new passkey → wallet tx → receipt → book record', async () => {
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={{ createCredential }} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByTestId('recover-verified')).toBeInTheDocument())

    await user.click(screen.getByText('Create & authorize new passkey'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/New passkey authorized/i))

    expect(createCredential).toHaveBeenCalled()
    expect(addOwnerPublicKey).toHaveBeenCalledWith(PUBLIC_KEY.x, PUBLIC_KEY.y)
    // Recorded only AFTER the receipt — the credential is now a controller
    // and passkey sign-in works immediately.
    const [rec] = knownCredentials()
    expect(rec.credentialId).toBe('cred-new')
    expect(rec.address.toLowerCase()).toBe(ACCOUNT.toLowerCase())
  })

  it('reports a reverted authorization honestly and does NOT record the credential', async () => {
    txWait.mockResolvedValue({ status: 0 })
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={{ createCredential }} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByTestId('recover-verified')).toBeInTheDocument())

    await user.click(screen.getByText('Create & authorize new passkey'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed/i))
    expect(knownCredentials()).toHaveLength(0)
  })

  it('offers known local addresses as hints', () => {
    const hinted = '0x' + 'b'.repeat(40)
    render(
      <RecoverAccountPanel
        deps={{ createCredential, knownCredentials: () => [{ credentialId: 'c1', address: hinted }] }}
      />
    )
    expect(screen.getByText(`${hinted.substring(0, 6)}...${hinted.substring(hinted.length - 4)}`)).toBeInTheDocument()
  })
})
