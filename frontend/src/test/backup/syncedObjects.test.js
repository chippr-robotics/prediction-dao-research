import { describe, it, expect, beforeEach } from 'vitest'
import { syncedObjects } from '../../lib/backup/syncedObjects'
import {
  deriveVaultKeyFromSeed,
  addEntry,
  readEntries,
  hasVault,
} from '../../lib/openChallenge/codeVault'

// Spec 032 — the synced-object registry: address book is network-scoped and merges additively by
// (address, chainId) so the same address on two networks stays two distinct entries (FR-015a/FR-008);
// preferences are network-agnostic and merge last-writer-wins.

const addressBook = syncedObjects.find((o) => o.key === 'addressBook')
const prefs = syncedObjects.find((o) => o.key === 'preferences')
const ADDR = '0x1111111111111111111111111111111111111111'

function bookWith(id, addr, chainId, nickname) {
  return { schemaVersion: 1, contacts: [{ id, nickname, addresses: [{ address: addr, chainId, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 }], updatedAt: 1 }
}

describe('syncedObjects', () => {
  it('declares the address book network-scoped and merges additively by (address, chainId)', () => {
    expect(addressBook.networkScoped).toBe(true)
    const current = bookWith('c1', ADDR, 137, 'Alex')
    const incoming = bookWith('c2', ADDR, 63, 'Alex') // SAME address, different network
    const { book } = addressBook.merge(current, incoming)
    const keys = book.contacts.flatMap((c) => c.addresses.map((a) => `${a.address.toLowerCase()}:${a.chainId}`))
    expect(keys).toContain(`${ADDR}:137`)
    expect(keys).toContain(`${ADDR}:63`)
    expect(keys.length).toBe(2) // two distinct entries, not collapsed
  })

  it('declares preferences network-agnostic and merges last-writer-wins', () => {
    expect(prefs.networkScoped).toBe(false)
    const { value } = prefs.merge({ defaultSlippage: 0.5 }, { defaultSlippage: 2.0 })
    expect(value).toEqual({ defaultSlippage: 2.0 })
  })
})

// Spec 024/037 follow-up — the open-challenge recovery-code vault rides the spec-032 backup channel
// so passkey users recover their codes on a new device. The bundled value is the OPAQUE at-rest
// ciphertext envelope; restore re-writes it and the SAME account key material re-opens it.
describe('syncedObjects — open-challenge recovery codes', () => {
  const codes = syncedObjects.find((o) => o.key === 'openChallengeCodes')
  const seedKey = deriveVaultKeyFromSeed(new Uint8Array(32).fill(9)) // deterministic passkey seed key

  beforeEach(() => localStorage.clear())

  it('is registered, network-agnostic, and loads the opaque encrypted envelope (never cleartext)', () => {
    expect(codes).toBeTruthy()
    expect(codes.networkScoped).toBe(false)
    addEntry(ADDR, seedKey, { code: 'river tiger kite zoo', wagerId: '7' })
    const loaded = codes.load(ADDR)
    expect(loaded).toMatchObject({ nonce: expect.any(String), ciphertext: expect.any(String) })
    expect(JSON.stringify(loaded)).not.toContain('river tiger kite zoo')
  })

  it('restores a passkey vault onto a fresh device and re-opens it with the same seed key', () => {
    // "Device A": save a code, then capture the bundle value the backup would carry.
    addEntry(ADDR, seedKey, { code: 'river tiger kite zoo', wagerId: '7', description: 'Rain?' })
    const bundled = codes.load(ADDR)

    // "Device B": nothing saved locally (the vault is otherwise device-local localStorage).
    localStorage.clear()
    expect(hasVault(ADDR)).toBe(false)

    codes.apply(ADDR, bundled, 'merge')

    // The restored envelope re-opens with the same passkey master seed → codes recovered.
    expect(readEntries(ADDR, seedKey)).toEqual([
      expect.objectContaining({ code: 'river tiger kite zoo', wagerId: '7', description: 'Rain?' }),
    ])
  })

  it('never clobbers existing local codes on restore (additive recovery only)', () => {
    addEntry(ADDR, seedKey, { code: 'local aaa bbb ccc', wagerId: '1' })
    const foreign = { format: 'fairwins-oc-code-vault', version: 1, alg: 'chacha20poly1305', nonce: 'x', ciphertext: 'y' }
    codes.apply(ADDR, foreign, 'merge')
    // Local vault is untouched — still decrypts to the original, unshredded by the (unmergeable) incoming blob.
    expect(readEntries(ADDR, seedKey).map((e) => e.code)).toEqual(['local aaa bbb ccc'])
  })

  it('no-ops when there is nothing to restore', () => {
    expect(() => codes.apply(ADDR, null, 'merge')).not.toThrow()
    expect(hasVault(ADDR)).toBe(false)
  })
})
