import { describe, it, expect } from 'vitest'
import { deriveKeyFromSignature, deriveKeyFromSeed, encryptBundle, decryptBundle, DATA_BACKUP_MESSAGE_V1 } from '../../lib/backup/backupCrypto'

// Spec 032 — backup encryption: deterministic signature-derived key, encrypt/decrypt round-trip, and honest
// failure (wrong key / tampered / foreign envelope throws → "no usable backup", local never overwritten).

const key = deriveKeyFromSignature('0xsignature-aaaa')
const otherKey = deriveKeyFromSignature('0xsignature-bbbb')
const bundle = { schema: 'fairwins-data-backup', version: 1, createdAt: 1, wallet: '0xabc', objects: { preferences: { defaultSlippage: 0.5 } } }

describe('backupCrypto', () => {
  it('derives a deterministic 32-byte key from a signature', () => {
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
    expect(deriveKeyFromSignature('0xsignature-aaaa')).toEqual(key) // same signature → same key
    expect(otherKey).not.toEqual(key)
  })

  it('round-trips encrypt → decrypt', () => {
    const env = encryptBundle(key, bundle)
    expect(env.format).toBe('fairwins-data-backup')
    expect(env.version).toBe(1)
    expect(decryptBundle(key, env)).toEqual(bundle)
  })

  it('throws on a wrong key (AEAD auth failure)', () => {
    const env = encryptBundle(key, bundle)
    expect(() => decryptBundle(otherKey, env)).toThrow()
  })

  it('throws on a tampered ciphertext', () => {
    const env = encryptBundle(key, bundle)
    const last = env.ciphertext.slice(-1)
    const tampered = { ...env, ciphertext: env.ciphertext.slice(0, -1) + (last === 'a' ? 'b' : 'a') }
    expect(() => decryptBundle(key, tampered)).toThrow()
  })

  it('throws on a non-backup or foreign-version envelope', () => {
    expect(() => decryptBundle(key, { format: 'something-else', version: 1 })).toThrow()
    expect(() => decryptBundle(key, { ...encryptBundle(key, bundle), version: 2 })).toThrow()
  })

  it('uses a distinct domain message', () => {
    expect(DATA_BACKUP_MESSAGE_V1).toBe('FairWins Data Backup v1')
  })

  it('derives a deterministic 32-byte key from a passkey master seed (spec 041)', () => {
    const seed = new Uint8Array(32).fill(7)
    const seedKey = deriveKeyFromSeed(seed)
    expect(seedKey).toBeInstanceOf(Uint8Array)
    expect(seedKey.length).toBe(32)
    expect(deriveKeyFromSeed(new Uint8Array(32).fill(7))).toEqual(seedKey) // same seed → same key
    expect(deriveKeyFromSeed(new Uint8Array(32).fill(8))).not.toEqual(seedKey) // different seed → different key
  })

  it('round-trips a bundle encrypted under a seed-derived key', () => {
    const seedKey = deriveKeyFromSeed(new Uint8Array(32).fill(7))
    const env = encryptBundle(seedKey, bundle)
    expect(decryptBundle(seedKey, env)).toEqual(bundle)
    // A signature-derived key (even numerically identical seed bytes as a string) must NOT open it.
    expect(() => decryptBundle(deriveKeyFromSignature('0xsignature-aaaa'), env)).toThrow()
  })
})
