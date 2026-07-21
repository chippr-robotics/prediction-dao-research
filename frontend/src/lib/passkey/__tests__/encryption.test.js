/**
 * Spec 041 — passkey PRF → X25519/X-Wing derivation and the resolve/init seam.
 *
 * ensurePasskeyEncryptionKeys turns the per-account master seed (recovered from
 * the WebAuthn PRF extension) into the SAME kind of keypairs the EOA signature
 * path produces, so the published X25519 key and envelope interop are identical.
 * Verified here without a real authenticator by injecting getAssertion/store.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ensurePasskeyEncryptionKeys, resolveMasterSeed } from '../encryption'
import { blobStore } from '../prfKeys'
import { x25519 } from '@noble/curves/ed25519'

const ACCOUNT = '0x00000000000000000000000000000000000000aa'
const CRED_A = 'cred-A'
const CRED_B = 'cred-B'

// Deterministic PRF output per credential so wrap/unwrap round-trips like a real
// PRF-capable authenticator; a null prfOutput models a non-PRF device.
function makeAssertion(prfByte) {
  return async ({ credentialId }) => ({
    prfOutput: prfByte == null ? undefined : new Uint8Array(32).fill(prfByte + credentialId.length),
    signature: new Uint8Array(64),
    authenticatorData: new Uint8Array(37),
    clientDataJSON: new TextEncoder().encode('{}'),
  })
}

// Fresh in-memory localStorage-ish store per test.
function memStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  }
}

let storage
beforeEach(() => {
  storage = memStorage()
})

describe('ensurePasskeyEncryptionKeys', () => {
  it('initializes a fresh account and derives a valid X25519 + X-Wing keypair', async () => {
    const store = blobStore(storage)
    const keys = await ensurePasskeyEncryptionKeys({
      account: ACCOUNT,
      credentialId: CRED_A,
      deps: { store, getAssertion: makeAssertion(7) },
    })
    expect(keys.publicKey).toHaveLength(32)
    expect(keys.privateKey).toHaveLength(32)
    // Public key must be the curve point of the private key (registrable + usable).
    expect(Array.from(x25519.getPublicKey(keys.privateKey))).toEqual(Array.from(keys.publicKey))
    expect(keys.xwingPublicKey).toHaveLength(1216)
    // The init wrote a wrapped seed for this credential.
    expect(store.get(ACCOUNT, CRED_A)).toBeTruthy()
  })

  it('is deterministic: unwrap on a later ceremony yields the same keys as init', async () => {
    const store = blobStore(storage)
    const first = await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_A, deps: { store, getAssertion: makeAssertion(3) },
    })
    const second = await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_A, deps: { store, getAssertion: makeAssertion(3) },
    })
    expect(Array.from(second.publicKey)).toEqual(Array.from(first.publicKey))
    expect(Array.from(second.xwingPublicKey)).toEqual(Array.from(first.xwingPublicKey))
  })

  it('degrades honestly (EncryptionUnavailable) on a non-PRF authenticator', async () => {
    const store = blobStore(storage)
    await expect(
      ensurePasskeyEncryptionKeys({
        account: ACCOUNT, credentialId: CRED_A, deps: { store, getAssertion: makeAssertion(null) },
      })
    ).rejects.toMatchObject({ name: 'EncryptionUnavailable' })
  })

  it('refuses a credential with no key material on an already-initialized account', async () => {
    const store = blobStore(storage)
    // CRED_A initializes the account…
    await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_A, deps: { store, getAssertion: makeAssertion(1) },
    })
    // …CRED_B has no blob → never derive wrong keys, surface EncryptionUnavailable.
    await expect(
      resolveMasterSeed({ account: ACCOUNT, credentialId: CRED_B, deps: { store, getAssertion: makeAssertion(9) } })
    ).rejects.toMatchObject({ name: 'EncryptionUnavailable' })
    // The message must NOT point at a non-existent "Account → Controllers" component.
    await resolveMasterSeed({ account: ACCOUNT, credentialId: CRED_B, deps: { store, getAssertion: makeAssertion(9) } })
      .catch((e) => {
        expect(e.message).not.toMatch(/Account → Controllers/)
        expect(e.message).toMatch(/Backup & Security/)
      })
  })

  it('allowInit bootstraps a fresh seed for a stranded credential (single-device register self-heal)', async () => {
    const store = blobStore(storage)
    // The account carries a stale/foreign blob for CRED_A, but this device signs as CRED_B and has
    // no on-chain key — the caller opts into a safe bootstrap instead of dead-ending.
    await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_A, deps: { store, getAssertion: makeAssertion(1) },
    })
    const keys = await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_B, allowInit: true, deps: { store, getAssertion: makeAssertion(9) },
    })
    expect(keys.publicKey).toHaveLength(32)
    // The bootstrap wrote a wrapped seed for CRED_B, so a later ceremony unwraps deterministically.
    expect(store.get(ACCOUNT, CRED_B)).toBeTruthy()
    const again = await ensurePasskeyEncryptionKeys({
      account: ACCOUNT, credentialId: CRED_B, deps: { store, getAssertion: makeAssertion(9) },
    })
    expect(Array.from(again.publicKey)).toEqual(Array.from(keys.publicKey))
  })

  it('requires a bound credential id', async () => {
    const store = blobStore(storage)
    await expect(
      resolveMasterSeed({ account: ACCOUNT, credentialId: null, deps: { store } })
    ).rejects.toMatchObject({ name: 'EncryptionUnavailable' })
  })
})
