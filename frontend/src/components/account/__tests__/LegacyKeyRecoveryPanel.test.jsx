/**
 * Legacy key & word-list recovery panel (Recovery section).
 *
 * Covers: session gating, the guided bottom-sheet flow (intro → enter → secure
 * → transfer → done), live key/word-list detection, at-rest encryption on
 * continue, the recommend-and-sweep step (balance quote → transfer to a smart
 * account), and the stored-key list (unlock-to-move + remove). The recovery
 * library is mocked so the test drives the component's orchestration; the
 * library's crypto/ethers behavior is covered in test/recovery/legacyKeys.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockWallet = {
  address: '0x' + 'a'.repeat(40), // a passkey smart account → suggested destination
  provider: {},
  loginMethod: 'passkey',
  chainId: 137,
  isConnected: true,
}
vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: () => mockWallet }))

vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({ name: 'Polygon', nativeCurrency: { symbol: 'MATIC' }, explorer: { baseUrl: 'https://polygonscan.com' } }),
}))

// Lightweight address inputs so the test isn't coupled to ENS/wagmi wiring.
vi.mock('../../ui/AddressInput', () => ({
  default: ({ id, value, onChange, label }) => (
    <input aria-label={label} id={id} value={value} onChange={onChange} />
  ),
}))
vi.mock('../../ui/AddressBookButton', () => ({ default: () => <button type="button">Book</button> }))

// The recovery library — fully controlled per test.
const lib = vi.hoisted(() => ({
  classifySecret: vi.fn(),
  encryptLegacySecret: vi.fn(),
  decryptLegacySecret: vi.fn(),
  quoteNativeSweep: vi.fn(),
  sweepNativeToSmartAccount: vi.fn(),
  store: new Map(),
}))
vi.mock('../../../lib/recovery/legacyKeys', () => ({
  classifySecret: lib.classifySecret,
  encryptLegacySecret: lib.encryptLegacySecret,
  decryptLegacySecret: lib.decryptLegacySecret,
  quoteNativeSweep: lib.quoteNativeSweep,
  sweepNativeToSmartAccount: lib.sweepNativeToSmartAccount,
  legacyKeyVault: () => ({
    list: () => Array.from(lib.store.values()).sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0)),
    get: (a) => lib.store.get(String(a).toLowerCase()) ?? null,
    has: (a) => lib.store.has(String(a).toLowerCase()),
    set: (e) => lib.store.set(String(e.address).toLowerCase(), e),
    delete: (a) => lib.store.delete(String(a).toLowerCase()),
  }),
}))

import LegacyKeyRecoveryPanel from '../LegacyKeyRecoveryPanel'

const LEGACY_ADDR = '0x' + 'f'.repeat(40)
const DEST = mockWallet.address

beforeEach(() => {
  lib.store.clear()
  vi.clearAllMocks()
  lib.classifySecret.mockReturnValue({ kind: 'empty' })
})

async function openToEnter(user) {
  await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
  await user.click(screen.getByRole('button', { name: 'Get started' }))
}

describe('LegacyKeyRecoveryPanel', () => {
  it('renders nothing when disconnected', () => {
    mockWallet.isConnected = false
    const { container } = render(<LegacyKeyRecoveryPanel />)
    expect(container).toBeEmptyDOMElement()
    mockWallet.isConnected = true
  })

  it('detects a key, encrypts it, then sweeps funds to the smart account', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, kind: 'privateKey', address: LEGACY_ADDR, importedAt: 1 })
    lib.quoteNativeSweep.mockResolvedValue({ from: LEGACY_ADDR, balance: 5n, gasReserve: 1n, sendable: 4n })
    lib.sweepNativeToSmartAccount.mockResolvedValue({ hash: '0xdead', wait: async () => ({ status: 1 }) })

    render(<LegacyKeyRecoveryPanel />)
    await openToEnter(user)

    // Live detection appears once classifySecret recognizes the input.
    lib.classifySecret.mockReturnValue({ kind: 'privateKey', address: LEGACY_ADDR, secret: '0xkey' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), '0xkey')
    expect(await screen.findByTestId('lkr-detected')).toHaveTextContent(/private key/i)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Passphrase step — must match and clear the min length before encrypting.
    await user.type(screen.getByLabelText('Passphrase'), 'longenough')
    await user.type(screen.getByLabelText('Confirm passphrase'), 'longenough')
    await user.click(screen.getByRole('button', { name: 'Encrypt & continue' }))
    await waitFor(() => expect(lib.encryptLegacySecret).toHaveBeenCalledWith(expect.objectContaining({ passphrase: 'longenough', kind: 'privateKey' })))

    // Transfer step — destination pre-filled with the passkey smart account.
    expect(screen.getByLabelText('Destination smart account')).toHaveValue(DEST)
    await user.click(screen.getByRole('button', { name: 'Check balance' }))
    await waitFor(() => expect(screen.getByText(/Will transfer/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Transfer funds' }))
    await waitFor(() =>
      expect(lib.sweepNativeToSmartAccount).toHaveBeenCalledWith(expect.objectContaining({ to: DEST }))
    )
    expect(await screen.findByText(/Funds sent to your smart account/i)).toBeInTheDocument()
  })

  it('blocks continuing when passphrases do not match', async () => {
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await openToEnter(user)
    lib.classifySecret.mockReturnValue({ kind: 'mnemonic', address: LEGACY_ADDR, secret: 'a b c' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), 'a b c')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.type(screen.getByLabelText('Passphrase'), 'longenough')
    await user.type(screen.getByLabelText('Confirm passphrase'), 'different1')
    // Mismatch keeps the button disabled and never calls encrypt.
    expect(screen.getByRole('button', { name: 'Encrypt & continue' })).toBeDisabled()
    expect(lib.encryptLegacySecret).not.toHaveBeenCalled()
  })

  it('lists a stored key and unlocks it before moving funds', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'mnemonic', address: LEGACY_ADDR, importedAt: 42, v: 1, ct: 'x', iv: 'y', salt: 'z' })
    lib.decryptLegacySecret.mockResolvedValue('word list secret')
    lib.quoteNativeSweep.mockResolvedValue({ from: LEGACY_ADDR, balance: 5n, gasReserve: 1n, sendable: 4n })
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText(/word list/i)).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: 'Move funds' }))

    await user.type(screen.getByLabelText('Passphrase'), 'unlockme1')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(lib.decryptLegacySecret).toHaveBeenCalled())
    // Lands on the transfer step for that key.
    expect(await screen.findByText(/is stored encrypted on this device/i)).toBeInTheDocument()
  })

  it('removes a stored key from the list', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'privateKey', address: LEGACY_ADDR, importedAt: 42 })
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    expect(screen.getByRole('listitem')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Remove stored key/i }))
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument())
  })

  it('surfaces a decryption failure on unlock', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'privateKey', address: LEGACY_ADDR, importedAt: 42 })
    lib.decryptLegacySecret.mockRejectedValue(new Error('That passphrase did not unlock this key.'))
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await user.click(screen.getByRole('button', { name: 'Move funds' }))
    await user.type(screen.getByLabelText('Passphrase'), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not unlock/i)
  })
})
