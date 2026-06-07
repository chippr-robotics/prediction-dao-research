import { describe, it, expect } from 'vitest'
import {
  encryptEnvelope,
  decryptEnvelope,
  deriveKeyPairFromSignature,
} from '../../utils/crypto/envelopeEncryption.js'

// Spec 007 (FR-056/FR-057, SC-017): the governing T&C version hash is bound into the
// wager's encryption as ChaCha20-Poly1305 AAD + an authenticated `termsVersion` field.
// Omitting termsVersion reproduces legacy behavior (no AAD), so existing wagers still open.

const ALICE = '0x1234567890abcdef1234567890abcdef12345678'
const TV = { id: 'fairwins-terms-2026-06-07', hash: 'a'.repeat(64) }
const keys = () => deriveKeyPairFromSignature('0xalice-signature')

describe('envelope termsVersion AAD binding (T031)', () => {
  it('round-trips with a bound termsVersion and exposes the authenticated field', () => {
    const kp = keys()
    const env = encryptEnvelope({ secret: 'wager-terms' }, [{ address: ALICE, publicKey: kp.publicKey }], 2, TV)
    expect(env.termsVersion).toEqual({ id: TV.id, hash: TV.hash })
    expect(decryptEnvelope(env, ALICE, kp.privateKey)).toEqual({ secret: 'wager-terms' })
  })

  it('rejects a tampered termsVersion.hash (AEAD authentication fails)', () => {
    const kp = keys()
    const env = encryptEnvelope({ secret: 1 }, [{ address: ALICE, publicKey: kp.publicKey }], 2, TV)
    const tampered = { ...env, termsVersion: { ...env.termsVersion, hash: 'b'.repeat(64) } }
    expect(() => decryptEnvelope(tampered, ALICE, kp.privateKey)).toThrow()
  })

  it('legacy envelope (no termsVersion) round-trips with no AAD and no field', () => {
    const kp = keys()
    const env = encryptEnvelope({ secret: 2 }, [{ address: ALICE, publicKey: kp.publicKey }], 2)
    expect(env).not.toHaveProperty('termsVersion')
    expect(decryptEnvelope(env, ALICE, kp.privateKey)).toEqual({ secret: 2 })
  })

  it('does not alter the recipient key-wrapping shape', () => {
    const kp = keys()
    const env = encryptEnvelope({ x: 1 }, [{ address: ALICE, publicKey: kp.publicKey }], 2, TV)
    expect(env.keys).toHaveLength(1)
    expect(env.keys[0]).toHaveProperty('wrappedKey')
    expect(env.keys[0]).toHaveProperty('ephemeralPublicKey')
  })
})
