/**
 * Spec 045 US6 — wallet-only recovery, now a guided bottom-sheet wizard.
 * Covers: session gating (wallet sessions only), the step flow (intro →
 * account → confirm → done), the isOwnerAddress controller gate, the happy
 * path (create passkey → addOwnerPublicKey → receipt → book record), honest
 * failure reporting, the plain-language BAD_DATA message that replaced the raw
 * ethers error testers hit, the up-front passkey-unavailable warning, and
 * standard address entry (browser-known hint chips).
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
  chainId: 137,
}
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet,
}))

vi.mock('../../../config/networks', () => ({
  getNetwork: vi.fn(() => ({ name: 'Polygon' })),
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

// Passkeys available by default so the confirm step never blocks the happy path
// (jsdom has no WebAuthn, so the real detector would report unavailable).
const available = () => Promise.resolve({ available: true, platformAuthenticator: true })

function baseDeps(extra = {}) {
  return { createCredential, detectCapability: available, ...extra }
}

async function openToAccountStep(user) {
  await user.click(screen.getByRole('button', { name: 'Recover an account' }))
  await user.click(screen.getByRole('button', { name: 'Get started' }))
}

async function enterAndVerify(user, address = ACCOUNT) {
  await openToAccountStep(user)
  await user.type(screen.getByLabelText('Passkey account address'), address)
  await user.click(screen.getByRole('button', { name: 'Verify ownership' }))
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
  it('renders nothing for passkey sessions (they use the Controllers panel)', () => {
    mockWallet.loginMethod = 'passkey'
    const { container } = render(<RecoverAccountPanel deps={baseDeps()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no wallet is connected', () => {
    mockWallet.isConnected = false
    const { container } = render(<RecoverAccountPanel deps={baseDeps()} />)
    expect(container.firstChild).toBeNull()
  })

  it('walks the wizard: intro → account entry → verified confirm step', async () => {
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    // Sheet is closed until the member starts recovery.
    expect(screen.queryByLabelText('Passkey account address')).not.toBeInTheDocument()
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByTestId('recover-verified')).toBeInTheDocument())
  })

  it('refuses recovery when the wallet is not a controller and never reaches the ceremony', async () => {
    isOwnerAddress.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not a controller/i))
    // Stays on the account step — the confirm/ceremony button is not rendered.
    expect(screen.queryByText('Create & authorize new passkey')).not.toBeInTheDocument()
    expect(createCredential).not.toHaveBeenCalled()
  })

  it('turns the BAD_DATA decode failure into a plain-language, actionable message', async () => {
    isOwnerAddress.mockRejectedValue(
      Object.assign(new Error('could not decode result data (value="0x")'), { code: 'BAD_DATA' })
    )
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    await enterAndVerify(user)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/doesn't respond like a FairWins passkey account/i)
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Polygon/)
    // Raw ethers noise must not leak to the member.
    expect(screen.getByRole('alert')).not.toHaveTextContent(/BAD_DATA/)
  })

  it('flags an undeployed / wrong-network account before hitting the contract', async () => {
    mockWallet.provider = { getCode: vi.fn().mockResolvedValue('0x') }
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No passkey account is deployed/i))
    expect(isOwnerAddress).not.toHaveBeenCalled()
    mockWallet.provider = {}
  })

  it('recovers end-to-end: verify → new passkey → wallet tx → receipt → book record → done', async () => {
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByTestId('recover-verified')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Create & authorize new passkey' }))
    await waitFor(() => expect(screen.getByText(/New passkey authorized/i)).toBeInTheDocument())

    expect(createCredential).toHaveBeenCalled()
    expect(addOwnerPublicKey).toHaveBeenCalledWith(PUBLIC_KEY.x, PUBLIC_KEY.y)
    // Recorded only AFTER the receipt — the credential is now a controller.
    const [rec] = knownCredentials()
    expect(rec.credentialId).toBe('cred-new')
    expect(rec.address.toLowerCase()).toBe(ACCOUNT.toLowerCase())
  })

  it('reports a reverted authorization honestly and does NOT record the credential', async () => {
    txWait.mockResolvedValue({ status: 0 })
    const user = userEvent.setup()
    render(<RecoverAccountPanel deps={baseDeps()} />)
    await enterAndVerify(user)
    await waitFor(() => expect(screen.getByTestId('recover-verified')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Create & authorize new passkey' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed/i))
    expect(knownCredentials()).toHaveLength(0)
    // Still on the confirm step so the member can retry.
    expect(screen.getByRole('button', { name: 'Create & authorize new passkey' })).toBeEnabled()
  })

  it('warns up front when this browser cannot create passkeys (in-app browser)', async () => {
    const user = userEvent.setup()
    render(
      <RecoverAccountPanel
        deps={baseDeps({
          detectCapability: () =>
            Promise.resolve({ available: false, reason: 'This browser does not support passkeys.' }),
        })}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Recover an account' }))
    await waitFor(() =>
      expect(screen.getByText(/can't create passkeys/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/default browser/i)).toBeInTheDocument()
  })

  it('offers known local addresses as one-tap chips in the address step', async () => {
    const hinted = '0x' + 'b'.repeat(40)
    const user = userEvent.setup()
    render(
      <RecoverAccountPanel
        deps={baseDeps({ knownCredentials: () => [{ credentialId: 'c1', address: hinted }] })}
      />
    )
    await openToAccountStep(user)
    const chip = screen.getByRole('button', { name: `${hinted.substring(0, 6)}…${hinted.substring(hinted.length - 4)}` })
    expect(chip).toBeInTheDocument()
    await user.click(chip)
    expect(screen.getByLabelText('Passkey account address')).toHaveValue(hinted)
  })
})
