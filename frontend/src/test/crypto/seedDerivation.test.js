/**
 * Spec 041 — seed-based key derivation for passkey accounts.
 *
 * deriveKeyPairFromSeed / deriveXWingKeyPairFromSeed turn the PRF master seed into
 * the same kind of X25519 / X-Wing keypairs the signature path produces. These
 * assert determinism, correct key shapes, domain separation between the two
 * keypairs, and a full X-Wing encrypt→decrypt round-trip against a seed-derived key.
 */
import { describe, it, expect } from 'vitest'
import { x25519 } from '@noble/curves/ed25519'
import {
  deriveKeyPairFromSeed,
  deriveXWingKeyPairFromSeed,
  encryptEnvelopeXWing,
  decryptEnvelopeUnified,
} from '../../utils/crypto/envelopeEncryption'

const seed = (fill) => new Uint8Array(32).fill(fill)

describe('deriveKeyPairFromSeed (X25519)', () => {
  it('is deterministic and returns a valid 32-byte keypair', () => {
    const a = deriveKeyPairFromSeed(seed(1))
    const b = deriveKeyPairFromSeed(seed(1))
    expect(a.publicKey).toHaveLength(32)
    expect(a.privateKey).toHaveLength(32)
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey))
    // publicKey is the curve point of privateKey
    expect(Array.from(x25519.getPublicKey(a.privateKey))).toEqual(Array.from(a.publicKey))
  })

  it('different seeds ⇒ different keys', () => {
    const a = deriveKeyPairFromSeed(seed(1))
    const b = deriveKeyPairFromSeed(seed(2))
    expect(Array.from(a.publicKey)).not.toEqual(Array.from(b.publicKey))
  })

  it('rejects a non-32-byte seed', () => {
    expect(() => deriveKeyPairFromSeed(new Uint8Array(16))).toThrow(/32 bytes/i)
  })
})

describe('deriveXWingKeyPairFromSeed (post-quantum)', () => {
  it('is deterministic and returns a 1216-byte public key', () => {
    const a = deriveXWingKeyPairFromSeed(seed(5))
    const b = deriveXWingKeyPairFromSeed(seed(5))
    expect(a.publicKey).toHaveLength(1216)
    expect(a.secretKey).toHaveLength(32)
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey))
  })
})

describe('domain separation', () => {
  it('X25519 and X-Wing material from the same seed are independent', () => {
    const s = seed(9)
    const x = deriveKeyPairFromSeed(s)
    const xw = deriveXWingKeyPairFromSeed(s)
    // The X-Wing secret seed must not equal the raw master seed or the X25519 key.
    expect(Array.from(xw.secretKey)).not.toEqual(Array.from(s))
    expect(Array.from(xw.secretKey)).not.toEqual(Array.from(x.privateKey))
  })
})

describe('interop: a sender can encrypt to a seed-derived X-Wing key', () => {
  it('round-trips an X-Wing envelope for a passkey recipient', () => {
    const recipientAddr = '0x00000000000000000000000000000000000000bb'
    const { publicKey, secretKey } = deriveXWingKeyPairFromSeed(seed(42))

    const envelope = encryptEnvelopeXWing(
      { title: 'private wager', stake: '10' },
      [{ address: recipientAddr, publicKey }],
    )
    const decrypted = decryptEnvelopeUnified(envelope, recipientAddr, { xwingSecretKey: secretKey })
    expect(decrypted.title).toBe('private wager')
    expect(decrypted.stake).toBe('10')
  })
})
