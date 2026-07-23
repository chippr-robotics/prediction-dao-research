// Spec 063 (US3, T028/T029) — Solana SLIP-0010 ed25519 derivation + address vectors.
//
// Canonical "abandon ×11 about" mnemonic. The primary vector (m/44'/501'/0'/0') and the
// scheme-guard vector (m/44'/501'/0') are the values independently computed during research
// against the same @noble/@scure toolchain; matching them proves the hand-rolled SLIP-0010
// (hardened-only ed25519) is correct and did not silently fall back to secp256k1/BIP-32.

import { describe, it, expect } from 'vitest'
import { seedFromMnemonic } from '../../bitcoin/legacyDerivation'
import { deriveSolanaKeypair, signSolana } from '../derivation'
import { encodeSolanaAddress, isValidSolanaAddress } from '../address'
import { ed25519 } from '@noble/curves/ed25519'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('Solana derivation — pinned vectors', () => {
  it("bip44Change m/44'/501'/0'/0' matches the published address", () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const kp = deriveSolanaKeypair(seed, { scheme: 'bip44Change', account: 0 })
    expect(kp.address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')
    expect(kp.secret).toBeInstanceOf(Uint8Array)
    expect(kp.secret.length).toBe(32)
    expect(kp.pubkey.length).toBe(32)
  })

  it("bip44 m/44'/501'/0' resolves to a DIFFERENT address (scheme guard)", () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const kp = deriveSolanaKeypair(seed, { scheme: 'bip44', account: 0 })
    expect(kp.address).toBe('GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL')
  })

  it('derives distinct addresses per account index', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const a0 = deriveSolanaKeypair(seed, { account: 0 }).address
    const a1 = deriveSolanaKeypair(seed, { account: 1 }).address
    expect(a1).not.toBe(a0)
  })

  it('bareSeed uses the first 32 bytes of the BIP-39 seed', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const kp = deriveSolanaKeypair(seed, { scheme: 'bareSeed' })
    expect(kp.secret).toEqual(seed.slice(0, 32))
    expect(isValidSolanaAddress(kp.address)).toBe(true)
  })

  it('rejects an unknown scheme', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    expect(() => deriveSolanaKeypair(seed, { scheme: 'nope' })).toThrow(/unknown scheme/i)
  })

  it('produces valid ed25519 signatures from the derived key', () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const kp = deriveSolanaKeypair(seed, { account: 0 })
    const msg = new TextEncoder().encode('fairwins')
    const sig = signSolana(msg, kp.secret)
    expect(ed25519.verify(sig, msg, kp.pubkey)).toBe(true)
  })
})

describe('Solana address codec', () => {
  it('encodes a 32-byte pubkey as base58 with no checksum', () => {
    const pk = new Uint8Array(32).fill(1)
    const addr = encodeSolanaAddress(pk)
    expect(isValidSolanaAddress(addr)).toBe(true)
  })

  it('rejects non-32-byte input and malformed strings', () => {
    expect(() => encodeSolanaAddress(new Uint8Array(31))).toThrow(/32-byte/i)
    expect(isValidSolanaAddress('not base58 !!!')).toBe(false)
    expect(isValidSolanaAddress('')).toBe(false)
  })
})
