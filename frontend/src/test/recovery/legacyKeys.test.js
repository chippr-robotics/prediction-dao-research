/**
 * Legacy key & word-list recovery library (Recovery section).
 * Real ethers + real WebCrypto — no mocks — so the tests exercise the actual
 * classification, at-rest encryption, vault, and sweep-quote math.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { registerEthersCrypto } from './registerEthersCrypto'
import {
  classifySecret,
  encryptLegacySecret,
  decryptLegacySecret,
  legacyKeyVault,
  quoteNativeSweep,
  sweepNativeToSmartAccount,
  walletFromSecret,
} from '../../lib/recovery/legacyKeys'

// Hardhat account #0 — private key and 12-word mnemonic both resolve to this.
const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const MNEMONIC = 'test test test test test test test test test test test junk'
const EXPECTED_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

beforeAll(() => registerEthersCrypto())

describe('classifySecret', () => {
  it('recognizes a 0x-prefixed private key and derives its address', () => {
    const c = classifySecret(PK)
    expect(c.kind).toBe('privateKey')
    expect(c.address).toBe(EXPECTED_ADDR)
    expect(c.secret).toBe(PK)
  })

  it('accepts a private key without the 0x prefix', () => {
    const c = classifySecret(PK.slice(2))
    expect(c.kind).toBe('privateKey')
    expect(c.address).toBe(EXPECTED_ADDR)
  })

  it('recognizes a valid BIP-39 word list and normalizes case/whitespace', () => {
    const c = classifySecret(`  ${MNEMONIC.toUpperCase()}  `)
    expect(c.kind).toBe('mnemonic')
    expect(c.address).toBe(EXPECTED_ADDR)
    expect(c.wordCount).toBe(12)
    expect(c.secret).toBe(MNEMONIC)
  })

  it('flags empty input and gibberish distinctly', () => {
    expect(classifySecret('').kind).toBe('empty')
    expect(classifySecret('   ').kind).toBe('empty')
    expect(classifySecret('not a real key at all').kind).toBe('invalid')
    // 12 words but a bad checksum ⇒ invalid, never a false positive.
    expect(classifySecret('test test test test test test test test test test test test').kind).toBe('invalid')
    // Right length hex but not 64 nibbles.
    expect(classifySecret('0x1234').kind).toBe('invalid')
  })
})

describe('encrypt/decrypt at rest', () => {
  it('round-trips a private key under the right passphrase', async () => {
    const c = classifySecret(PK)
    const entry = await encryptLegacySecret({ secret: c.secret, kind: c.kind, address: c.address, passphrase: 'correct horse', deps: { now: 111 } })
    expect(entry.address).toBe(EXPECTED_ADDR)
    expect(entry.importedAt).toBe(111)
    // The ciphertext must not leak the secret.
    expect(JSON.stringify(entry)).not.toContain(PK)
    const back = await decryptLegacySecret({ entry, passphrase: 'correct horse' })
    expect(back).toBe(PK)
  })

  it('round-trips a mnemonic', async () => {
    const c = classifySecret(MNEMONIC)
    const entry = await encryptLegacySecret({ secret: c.secret, kind: c.kind, address: c.address, passphrase: 'passw0rd!' })
    const back = await decryptLegacySecret({ entry, passphrase: 'passw0rd!' })
    expect(back).toBe(MNEMONIC)
  })

  it('rejects a wrong passphrase without leaking data', async () => {
    const c = classifySecret(PK)
    const entry = await encryptLegacySecret({ secret: c.secret, kind: c.kind, address: c.address, passphrase: 'right-one-here' })
    await expect(decryptLegacySecret({ entry, passphrase: 'wrong-one-here' })).rejects.toThrow(/did not unlock/i)
  })

  it('refuses a too-short passphrase', async () => {
    await expect(
      encryptLegacySecret({ secret: PK, kind: 'privateKey', address: EXPECTED_ADDR, passphrase: 'short' })
    ).rejects.toThrow(/at least 8/i)
  })
})

describe('legacyKeyVault', () => {
  let storage
  beforeEach(() => {
    const map = new Map()
    storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    }
  })

  it('stores by lowercased address, lists newest-first, and deletes', () => {
    const vault = legacyKeyVault(storage)
    vault.set({ address: EXPECTED_ADDR, kind: 'privateKey', importedAt: 100 })
    vault.set({ address: '0x' + 'b'.repeat(40), kind: 'mnemonic', importedAt: 200 })
    expect(vault.list().map((e) => e.importedAt)).toEqual([200, 100])
    expect(vault.has(EXPECTED_ADDR.toLowerCase())).toBe(true)
    expect(vault.get(EXPECTED_ADDR.toUpperCase())).toBeTruthy()
    vault.delete(EXPECTED_ADDR)
    expect(vault.has(EXPECTED_ADDR)).toBe(false)
    expect(vault.list()).toHaveLength(1)
  })

  it('re-storing the same address replaces rather than duplicates', () => {
    const vault = legacyKeyVault(storage)
    vault.set({ address: EXPECTED_ADDR, kind: 'privateKey', importedAt: 1 })
    vault.set({ address: EXPECTED_ADDR.toLowerCase(), kind: 'privateKey', importedAt: 2 })
    expect(vault.list()).toHaveLength(1)
    expect(vault.get(EXPECTED_ADDR).importedAt).toBe(2)
  })
})

describe('native sweep', () => {
  const to = '0x' + 'c'.repeat(40)
  const makeProvider = (balance, gas = 2_000_000_000n) => ({
    getBalance: async () => balance,
    getFeeData: async () => ({ maxFeePerGas: gas, gasPrice: gas }),
  })

  it('quotes sendable = balance minus a padded gas reserve', async () => {
    const provider = makeProvider(10n ** 17n) // 0.1 ETH
    const q = await quoteNativeSweep({ kind: 'privateKey', secret: PK, provider })
    expect(q.from).toBe(EXPECTED_ADDR)
    // reserve = 21000 * 2gwei * 1.2
    const expectedReserve = (21000n * 2_000_000_000n * 12n) / 10n
    expect(q.gasReserve).toBe(expectedReserve)
    expect(q.sendable).toBe(10n ** 17n - expectedReserve)
  })

  it('reports zero sendable when the balance cannot cover the fee', async () => {
    const provider = makeProvider(1000n)
    const q = await quoteNativeSweep({ kind: 'privateKey', secret: PK, provider })
    expect(q.sendable).toBe(0n)
  })

  it('sweep refuses an invalid destination', async () => {
    await expect(
      sweepNativeToSmartAccount({ kind: 'privateKey', secret: PK, to: 'nope', provider: makeProvider(10n ** 18n) })
    ).rejects.toThrow(/valid destination/i)
  })

  it('sweep refuses when there is nothing to move after fees', async () => {
    await expect(
      sweepNativeToSmartAccount({ kind: 'privateKey', secret: PK, to, provider: makeProvider(1n) })
    ).rejects.toThrow(/nothing to transfer/i)
  })

  it('walletFromSecret derives the same address for key and phrase', () => {
    expect(walletFromSecret({ kind: 'privateKey', secret: PK }).address).toBe(EXPECTED_ADDR)
    expect(walletFromSecret({ kind: 'mnemonic', secret: MNEMONIC }).address).toBe(EXPECTED_ADDR)
  })
})
