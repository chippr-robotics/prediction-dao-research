/**
 * Cross-device passkey sign-in — recovering the public key from the assertion itself.
 *
 * These tests build REAL P-256 signatures over REAL WebAuthn-shaped payloads
 * (sha256(authenticatorData || sha256(clientDataJSON)), DER-encoded) rather than mocking the
 * crypto, because the whole feature is a claim about what the maths permits. The single most
 * important assertion here is the SAFETY one: one signature is never enough to identify a key,
 * and the module must refuse rather than guess — a wrong key derives a real-looking address the
 * member could be told to fund and could never spend from.
 */
import { describe, it, expect, vi } from 'vitest'
import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'

import {
  derToRS,
  webauthnSignedHash,
  recoverCandidateKeys,
  recoverPublicKey,
  CrossDeviceRecoveryFailed,
} from '../crossDevice'
import { publicKeyToOwnerBytes } from '../smartAccount'

const enc = (s) => new TextEncoder().encode(s)
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0))
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
const toHex = (u8) => `0x${Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')}`

/** Build a WebAuthn-shaped assertion signed by `priv` over `challenge`. */
function makeAssertion(priv, challenge, { credentialId = 'cred-x' } = {}) {
  const authenticatorData = concat(sha256(enc('fairwins.app')), new Uint8Array([0x05]), new Uint8Array([0, 0, 0, 7]))
  const clientDataJSON = enc(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://fairwins.app' }))
  const hash = sha256(concat(authenticatorData, sha256(clientDataJSON)))
  // prehash:false — an authenticator signs the DIGEST, and @noble/curves v2 prehashes by default.
  const sig = p256.sign(hash, priv, { lowS: false, prehash: false })
  // @noble/curves v2 returns compact BYTES here; v1 returned a Signature instance.
  const sigObj = sig instanceof Uint8Array ? p256.Signature.fromBytes(sig) : sig
  const der = sigObj.toDERRawBytes ? sigObj.toDERRawBytes() : sigObj.toBytes('der')
  return { credentialId, authenticatorData, clientDataJSON, signature: new Uint8Array(der) }
}

const keyOf = (priv) => {
  const xy = p256.getPublicKey(priv, false).subarray(1)
  return toHex(xy)
}

describe('DER decoding', () => {
  it('round-trips r/s including the leading-0x00 sign-byte case', () => {
    // Sign repeatedly so both a high-bit r or s (which DER pads) and a plain one are covered.
    const priv = p256.utils.randomSecretKey()
    for (let i = 0; i < 25; i++) {
      const a = makeAssertion(priv, `c-${i}`)
      const { r, s } = derToRS(a.signature)
      expect(r).toBeGreaterThan(0n)
      expect(s).toBeGreaterThan(0n)
    }
  })

  it('rejects a malformed signature instead of returning junk', () => {
    expect(() => derToRS(new Uint8Array([0x31, 0x02, 0x01, 0x01]))).toThrow(CrossDeviceRecoveryFailed)
  })
})

describe('webauthnSignedHash', () => {
  it('is sha256(authenticatorData || sha256(clientDataJSON))', () => {
    const authenticatorData = new Uint8Array([1, 2, 3])
    const clientDataJSON = enc('{}')
    expect(toHex(webauthnSignedHash({ authenticatorData, clientDataJSON }))).toBe(
      toHex(sha256(concat(authenticatorData, sha256(clientDataJSON))))
    )
  })
})

describe('recoverCandidateKeys — the safety property', () => {
  it('always returns MORE THAN ONE candidate for a single signature', () => {
    // This is why the module refuses to resolve from one assertion. If this ever returns 1, the
    // extra ceremony could be dropped — but it does not, because ECDSA does not permit it.
    const priv = p256.utils.randomSecretKey()
    for (let i = 0; i < 20; i++) {
      const cands = recoverCandidateKeys(makeAssertion(priv, `c-${i}`))
      expect(cands.length).toBeGreaterThan(1)
    }
  })

  it('always includes the true key, in owner-bytes encoding', () => {
    const priv = p256.utils.randomSecretKey()
    const cands = recoverCandidateKeys(makeAssertion(priv, 'abc'))
    expect(cands).toContain(keyOf(priv))
  })

  it('produces exactly the encoding publicKeyToOwnerBytes does (matches ownerAtIndex on chain)', () => {
    const priv = p256.utils.randomSecretKey()
    const xy = keyOf(priv)
    const asPublicKey = { x: `0x${xy.slice(2, 66)}`, y: `0x${xy.slice(66, 130)}` }
    expect(publicKeyToOwnerBytes(asPublicKey)).toBe(xy)
    expect(recoverCandidateKeys(makeAssertion(priv, 'abc'))).toContain(publicKeyToOwnerBytes(asPublicKey))
  })
})

describe('recoverPublicKey — two assertions intersect to exactly one key', () => {
  const priv = p256.utils.randomSecretKey()

  it('resolves the true key and pins the second ceremony to the same credential', async () => {
    const first = makeAssertion(priv, 'challenge-1', { credentialId: 'cred-1' })
    const getAssertion = vi.fn(async () => makeAssertion(priv, 'challenge-2', { credentialId: 'cred-1' }))
    const { ownerBytes, publicKey } = await recoverPublicKey({ first, deps: { getAssertion } })

    expect(ownerBytes).toBe(keyOf(priv))
    expect(publicKeyToOwnerBytes(publicKey)).toBe(keyOf(priv))
    // Pinned: no chooser, and a different passkey cannot be substituted mid-flow.
    expect(getAssertion.mock.calls[0][0].credentialId).toBe('cred-1')
  })

  it('refuses when the second ceremony used a DIFFERENT passkey', async () => {
    const other = p256.utils.randomSecretKey()
    const first = makeAssertion(priv, 'challenge-1', { credentialId: 'cred-1' })
    const getAssertion = vi.fn(async () => makeAssertion(other, 'challenge-2', { credentialId: 'cred-1' }))
    await expect(recoverPublicKey({ first, deps: { getAssertion } })).rejects.toBeInstanceOf(CrossDeviceRecoveryFailed)
  })

  it('refuses when the authenticator returns a different credential id', async () => {
    const first = makeAssertion(priv, 'challenge-1', { credentialId: 'cred-1' })
    const getAssertion = vi.fn(async () => makeAssertion(priv, 'challenge-2', { credentialId: 'cred-OTHER' }))
    await expect(recoverPublicKey({ first, deps: { getAssertion } })).rejects.toBeInstanceOf(CrossDeviceRecoveryFailed)
  })

  it('never resolves from a single assertion (no first ⇒ refuse)', async () => {
    await expect(recoverPublicKey({ first: null })).rejects.toBeInstanceOf(CrossDeviceRecoveryFailed)
  })

  it('is stable across many keys — always exactly the signer, never a decoy', async () => {
    for (let i = 0; i < 15; i++) {
      const k = p256.utils.randomSecretKey()
      const first = makeAssertion(k, `a-${i}`)
      const getAssertion = async () => makeAssertion(k, `b-${i}`)
      const { ownerBytes } = await recoverPublicKey({ first, deps: { getAssertion } })
      expect(ownerBytes).toBe(keyOf(k))
    }
  })
})
