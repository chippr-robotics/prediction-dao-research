/**
 * Legacy key & word-list recovery panel (Recovery section, spec 062).
 *
 * Covers: session gating, the guided flow ending at SAVED (recovery completes
 * with no transfer), the audit call on save, the optional save-to-address-book
 * upsert, the optional all-asset sweep (balances → per-asset outcomes, partial
 * failure), and the stored-key list (unlock-to-move + remove). The recovery
 * library, address book, and audit source are mocked so the test drives the
 * component's orchestration; their internals are covered in their own suites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

const mockWallet = {
  address: '0x' + 'a'.repeat(40), // passkey smart account → suggested destination
  provider: {},
  loginMethod: 'passkey',
  chainId: 137,
  isConnected: true,
}
vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: () => mockWallet }))

vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({ name: 'Polygon', nativeCurrency: { symbol: 'MATIC' }, explorer: { baseUrl: 'https://polygonscan.com' } }),
}))

vi.mock('../../ui/AddressInput', () => ({
  default: ({ id, value, onChange, label }) => <input aria-label={label} id={id} value={value} onChange={onChange} />,
}))
vi.mock('../../ui/AddressBookButton', () => ({ default: () => <button type="button">Book</button> }))

// Address book hook — controlled.
const book = vi.hoisted(() => ({ findByAddress: vi.fn(), addContact: vi.fn(), updateContact: vi.fn() }))
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => book }))

// Audit source — spy.
const audit = vi.hoisted(() => ({ captureLegacyRecovery: vi.fn() }))
vi.mock('../../../data/ledger/sources/legacyRecoverySource', () => ({ captureLegacyRecovery: audit.captureLegacyRecovery }))

// Recovery library — fully controlled per test.
const lib = vi.hoisted(() => ({
  classifySecret: vi.fn(),
  encryptLegacySecret: vi.fn(),
  encryptLegacySecretWithPasskey: vi.fn(),
  decryptLegacySecret: vi.fn(),
  decryptLegacySecretWithPasskey: vi.fn(),
  quoteAllAssets: vi.fn(),
  sweepAllAssets: vi.fn(),
  store: new Map(),
}))
vi.mock('../../../lib/recovery/legacyKeys', () => ({
  classifySecret: lib.classifySecret,
  encryptLegacySecret: lib.encryptLegacySecret,
  encryptLegacySecretWithPasskey: lib.encryptLegacySecretWithPasskey,
  decryptLegacySecret: lib.decryptLegacySecret,
  decryptLegacySecretWithPasskey: lib.decryptLegacySecretWithPasskey,
  quoteAllAssets: lib.quoteAllAssets,
  sweepAllAssets: lib.sweepAllAssets,
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

async function importToSaved(user, kind = 'privateKey') {
  await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
  await user.click(screen.getByRole('button', { name: 'Get started' }))
  lib.classifySecret.mockReturnValue({ kind, address: LEGACY_ADDR, secret: '0xkey' })
  await user.type(screen.getByLabelText('Private key or recovery word list'), '0xkey')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText('Passphrase'), 'longenough')
  await user.type(screen.getByLabelText('Confirm passphrase'), 'longenough')
  await user.click(screen.getByRole('button', { name: 'Encrypt & save' }))
  await screen.findByTestId('lkr-saved')
}

describe('LegacyKeyRecoveryPanel', () => {
  it('renders nothing when disconnected', () => {
    mockWallet.isConnected = false
    const { container } = render(<LegacyKeyRecoveryPanel />)
    expect(container).toBeEmptyDOMElement()
    mockWallet.isConnected = true
  })

  it('completes recovery at SAVED without any transfer, and writes the audit record', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, kind: 'privateKey', address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)

    // Recovery is complete on its own — the SAVED screen, no transfer required.
    expect(screen.getByTestId('lkr-saved')).toHaveTextContent(/stored encrypted/i)
    expect(lib.encryptLegacySecret).toHaveBeenCalledWith(expect.objectContaining({ passphrase: 'longenough' }))
    // Audit written with address + type, never a secret.
    expect(audit.captureLegacyRecovery).toHaveBeenCalledWith(
      DEST, 137, { recoveredAddress: LEGACY_ADDR, source: 'privateKey' }
    )
    // Closing here (Done) leaves recovery complete without moving funds.
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('protects the key with biometrics (no passphrase) when a passkey is available', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecretWithPasskey.mockResolvedValue({ v: 2, protection: 'passkey', address: LEGACY_ADDR, credentialId: 'cred-1', importedAt: 1, ct: 'x' })
    // deps.readSession makes a passkey credential available → biometric-first.
    render(<LegacyKeyRecoveryPanel deps={{ readSession: () => ({ credentialId: 'cred-1' }) }} />)
    await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    lib.classifySecret.mockReturnValue({ kind: 'privateKey', address: LEGACY_ADDR, secret: '0xkey' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), '0xkey')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Biometric step: no passphrase fields, a "Protect with biometrics" action.
    expect(screen.queryByLabelText('Passphrase')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Protect with biometrics' }))
    await waitFor(() =>
      expect(lib.encryptLegacySecretWithPasskey).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'cred-1' }))
    )
    expect(lib.encryptLegacySecret).not.toHaveBeenCalled()
    expect(await screen.findByTestId('lkr-saved')).toBeInTheDocument()
  })

  it('lets the member fall back to a passphrase from the biometric step', async () => {
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel deps={{ readSession: () => ({ credentialId: 'cred-1' }) }} />)
    await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    lib.classifySecret.mockReturnValue({ kind: 'privateKey', address: LEGACY_ADDR, secret: '0xkey' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), '0xkey')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Use a passphrase instead' }))
    expect(screen.getByLabelText('Passphrase')).toBeInTheDocument()
  })

  it('unlocks a biometric-protected stored key without a passphrase', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { protection: 'passkey', kind: 'privateKey', address: LEGACY_ADDR, importedAt: 42, credentialId: 'cred-1', ct: 'x' })
    lib.decryptLegacySecretWithPasskey.mockResolvedValue('0xkey')
    lib.quoteAllAssets.mockResolvedValue({ from: LEGACY_ADDR, holdings: [], nativeGasReserve: 1n, hasNative: false })
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await user.click(screen.getByRole('button', { name: 'Move funds' }))
    // No passphrase field — biometric unlock button instead.
    expect(screen.queryByLabelText('Passphrase')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unlock with biometrics' }))
    await waitFor(() => expect(lib.decryptLegacySecretWithPasskey).toHaveBeenCalled())
    expect(await screen.findByLabelText('Destination smart account')).toBeInTheDocument()
  })

  it('suggests BIP-39 completions while typing a word list', async () => {
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    lib.classifySecret.mockReturnValue({ kind: 'invalid' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), 'legal winner aban')
    // A completion chip for the partial word appears; clicking it completes the word.
    const chip = await screen.findByRole('button', { name: 'abandon' })
    await user.click(chip)
    expect(screen.getByLabelText('Private key or recovery word list')).toHaveValue('legal winner abandon ')
  })

  it('blocks continuing when passphrases do not match', async () => {
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await user.click(screen.getByRole('button', { name: 'Recover a legacy key' }))
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    lib.classifySecret.mockReturnValue({ kind: 'mnemonic', address: LEGACY_ADDR, secret: 'a b c' })
    await user.type(screen.getByLabelText('Private key or recovery word list'), 'a b c')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Passphrase'), 'longenough')
    await user.type(screen.getByLabelText('Confirm passphrase'), 'different1')
    expect(screen.getByRole('button', { name: 'Encrypt & save' })).toBeDisabled()
    expect(lib.encryptLegacySecret).not.toHaveBeenCalled()
  })

  it('saves the recovered account to the address book (upsert)', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    book.findByAddress.mockReturnValue(null) // not yet in book → addContact
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)

    await user.click(screen.getByRole('button', { name: 'Save to address book' }))
    expect(book.addContact).toHaveBeenCalledWith(
      expect.objectContaining({ addresses: [expect.objectContaining({ address: LEGACY_ADDR, chainId: 137 })] })
    )
    expect(await screen.findByText(/Saved to your address book/i)).toBeInTheDocument()
  })

  it('moves all supported assets to the smart account and shows per-asset outcomes', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    lib.quoteAllAssets.mockResolvedValue({
      from: LEGACY_ADDR,
      holdings: [
        { asset: { id: 'usdc', symbol: 'USDC', decimals: 6 }, balance: 5_000_000n },
        { asset: { id: 'native', symbol: 'MATIC', decimals: 18 }, balance: 10n ** 17n },
      ],
      nativeGasReserve: 1n,
      hasNative: true,
    })
    lib.sweepAllAssets.mockResolvedValue([
      { asset: { symbol: 'USDC' }, status: 'sent', txHash: '0x1' },
      { asset: { symbol: 'MATIC' }, status: 'sent', txHash: '0x2' },
    ])
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move funds' }))
    expect(screen.getByLabelText('Destination smart account')).toHaveValue(DEST)
    await user.click(screen.getByRole('button', { name: 'Check balances' }))
    await waitFor(() => expect(screen.getByText('USDC')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Transfer all' }))
    await waitFor(() => expect(lib.sweepAllAssets).toHaveBeenCalledWith(expect.objectContaining({ to: DEST, chainId: 137 })))
    expect(await screen.findByText(/Funds moved to your smart account/i)).toBeInTheDocument()
  })

  it('keeps a partial failure visible instead of declaring success', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    lib.quoteAllAssets.mockResolvedValue({
      from: LEGACY_ADDR,
      holdings: [
        { asset: { id: 'usdc', symbol: 'USDC', decimals: 6 }, balance: 5_000_000n },
        { asset: { id: 'native', symbol: 'MATIC', decimals: 18 }, balance: 10n ** 17n },
      ],
      nativeGasReserve: 1n,
      hasNative: true,
    })
    lib.sweepAllAssets.mockResolvedValue([
      { asset: { symbol: 'USDC' }, status: 'failed', error: 'reverted' },
      { asset: { symbol: 'MATIC' }, status: 'sent', txHash: '0x2' },
    ])
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move funds' }))
    await user.click(screen.getByRole('button', { name: 'Check balances' }))
    await waitFor(() => expect(screen.getByText('USDC')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Transfer all' }))
    // Failure is shown; we do NOT advance to the success screen.
    expect(await screen.findByText(/failed — reverted/i)).toBeInTheDocument()
    expect(screen.queryByText(/Funds moved to your smart account/i)).not.toBeInTheDocument()
  })

  it('discloses the estimated fee and blocks transfer when there is no native for gas', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    // Tokens present but zero native ⇒ cannot pay gas ⇒ transfer must be blocked.
    lib.quoteAllAssets.mockResolvedValue({
      from: LEGACY_ADDR,
      holdings: [{ asset: { id: 'usdc', symbol: 'USDC', decimals: 6 }, balance: 5_000_000n }],
      nativeGasReserve: 0n,
      hasNative: false,
    })
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move funds' }))
    await user.click(screen.getByRole('button', { name: 'Check balances' }))
    await waitFor(() => expect(screen.getByText('USDC')).toBeInTheDocument())
    expect(screen.getByText(/no MATIC to pay network fees/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transfer all' })).toBeDisabled()
    expect(lib.sweepAllAssets).not.toHaveBeenCalled()
  })

  it('discloses the estimated network fee before signing', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    lib.quoteAllAssets.mockResolvedValue({
      from: LEGACY_ADDR,
      holdings: [{ asset: { id: 'native', symbol: 'MATIC', decimals: 18 }, balance: 10n ** 18n }],
      nativeGasReserve: 5n * 10n ** 16n, // 0.05 MATIC
      nativeGasLimit: 25200n,
      hasNative: true,
    })
    render(<LegacyKeyRecoveryPanel />)
    await importToSaved(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move funds' }))
    await user.click(screen.getByRole('button', { name: 'Check balances' }))
    expect(await screen.findByText(/Estimated network fee/i)).toBeInTheDocument()
    expect(screen.getByText(/≈ 0.05 MATIC/)).toBeInTheDocument()
  })

  it('unlocks a stored key before moving funds', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'mnemonic', address: LEGACY_ADDR, importedAt: 42, ct: 'x' })
    lib.decryptLegacySecret.mockResolvedValue('word list secret')
    lib.quoteAllAssets.mockResolvedValue({ from: LEGACY_ADDR, holdings: [], nativeGasReserve: 1n, hasNative: false })
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)

    const item = screen.getByRole('listitem')
    expect(within(item).getByText(/word list/i)).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: 'Move funds' }))
    await user.type(screen.getByLabelText('Passphrase'), 'unlockme1')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(lib.decryptLegacySecret).toHaveBeenCalled())
    expect(await screen.findByLabelText('Destination smart account')).toBeInTheDocument()
  })

  it('removes a stored key', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'privateKey', address: LEGACY_ADDR, importedAt: 42, ct: 'x' })
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    expect(screen.getByRole('listitem')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Remove stored key/i }))
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument())
  })

  it('has no accessibility violations on the entry and SAVED screens', async () => {
    const user = userEvent.setup()
    lib.encryptLegacySecret.mockResolvedValue({ v: 1, address: LEGACY_ADDR, importedAt: 1, ct: 'x' })
    const { container } = render(<LegacyKeyRecoveryPanel />)
    expect(await axe(container)).toHaveNoViolations()
    await importToSaved(user)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('surfaces a decryption failure on unlock', async () => {
    lib.store.set(LEGACY_ADDR.toLowerCase(), { kind: 'privateKey', address: LEGACY_ADDR, importedAt: 42, ct: 'x' })
    lib.decryptLegacySecret.mockRejectedValue(new Error('That passphrase did not unlock this key.'))
    const user = userEvent.setup()
    render(<LegacyKeyRecoveryPanel />)
    await user.click(screen.getByRole('button', { name: 'Move funds' }))
    await user.type(screen.getByLabelText('Passphrase'), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not unlock/i)
  })
})
