/**
 * Spec 041 T023 — PRF pipeline: wrap/unwrap round-trip, per-credential KEK
 * isolation, idempotent init, capability degradation, and the
 * no-silent-wrong-keys invariant. WebAuthn PRF is stubbed with deterministic
 * per-credential outputs (that IS the PRF contract); WebCrypto is real (jsdom
 * environment ships node's webcrypto).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  initMasterSeed,
  unwrapMasterSeed,
  wrapForController,
  revokeController,
  capability,
  blobStore,
  EncryptionUnavailable,
} from '../prfKeys'

const ACCOUNT = '0xAaAa000000000000000000000000000000000001'

/** Deterministic fake PRF: output = sha-like function of credentialId (stable per credential). */
function fakeGetAssertion({ prf = true } = {}) {
  return async ({ credentialId }) => {
    if (!prf) return { credentialId, prfOutput: undefined }
    const out = new Uint8Array(32)
    for (let i = 0; i < credentialId.length; i++) out[i % 32] ^= credentialId.charCodeAt(i) + i
    return { credentialId, prfOutput: out }
  }
}

function deps(overrides = {}) {
  return { getAssertion: fakeGetAssertion(), store: blobStore(localStorage), ...overrides }
}

describe('master seed lifecycle', () => {
  beforeEach(() => localStorage.clear())

  it('init → unwrap round-trips the identical seed (same credential, later session)', async () => {
    const d = deps()
    const seed = await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    const recovered = await unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    expect(Array.from(recovered)).toEqual(Array.from(seed))
  })

  it('init is idempotent-guarded: refuses when the account already has key material', async () => {
    const d = deps()
    await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    await expect(initMasterSeed({ account: ACCOUNT, credentialId: 'cred-2', deps: d })).rejects.toThrow(
      /already initialized/
    )
  })

  it('wrapForController grants a SECOND credential the SAME seed (FR-012)', async () => {
    const d = deps()
    const seed = await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    await wrapForController({ account: ACCOUNT, seed, credentialId: 'cred-2', deps: d })
    const viaSecond = await unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-2', deps: d })
    expect(Array.from(viaSecond)).toEqual(Array.from(seed))
  })

  it('a credential without a blob gets EncryptionUnavailable — never different keys', async () => {
    const d = deps()
    await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    await expect(unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-9', deps: d })).rejects.toBeInstanceOf(
      EncryptionUnavailable
    )
  })

  it("another credential's blob cannot be opened with the wrong KEK (AEAD isolation)", async () => {
    const d = deps()
    await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    // Simulate credential confusion: cred-2 tries to unwrap cred-1's blob.
    const blob = d.store.get(ACCOUNT, 'cred-1')
    d.store.set(ACCOUNT, 'cred-2', blob)
    await expect(unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-2', deps: d })).rejects.toBeInstanceOf(
      EncryptionUnavailable
    )
  })

  it('revokeController removes exactly that credential’s access', async () => {
    const d = deps()
    const seed = await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    await wrapForController({ account: ACCOUNT, seed, credentialId: 'cred-2', deps: d })
    revokeController({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    await expect(unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })).rejects.toBeInstanceOf(
      EncryptionUnavailable
    )
    const viaSecond = await unwrapMasterSeed({ account: ACCOUNT, credentialId: 'cred-2', deps: d })
    expect(Array.from(viaSecond)).toEqual(Array.from(seed))
  })

  it('non-PRF authenticator surfaces EncryptionUnavailable at ceremony time (clarification Q1)', async () => {
    const d = deps({ getAssertion: fakeGetAssertion({ prf: false }) })
    await expect(initMasterSeed({ account: ACCOUNT, credentialId: 'cred-x', deps: d })).rejects.toBeInstanceOf(
      EncryptionUnavailable
    )
  })
})

describe('capability (degradation UI input)', () => {
  beforeEach(() => localStorage.clear())

  it('unavailable for non-PRF devices, with a user-displayable reason', () => {
    const out = capability({ account: ACCOUNT, credentialId: 'c', prfCapable: false, deps: deps() })
    expect(out.state).toBe('unavailable')
    expect(out.reason).toMatch(/PRF/i)
  })

  it('uninitialized for a fresh account, available once this credential holds a blob', async () => {
    const d = deps()
    expect(capability({ account: ACCOUNT, credentialId: 'cred-1', prfCapable: true, deps: d }).state).toBe(
      'uninitialized'
    )
    await initMasterSeed({ account: ACCOUNT, credentialId: 'cred-1', deps: d })
    expect(capability({ account: ACCOUNT, credentialId: 'cred-1', prfCapable: true, deps: d }).state).toBe('available')
    expect(capability({ account: ACCOUNT, credentialId: 'cred-2', prfCapable: true, deps: d }).state).toBe(
      'unavailable'
    )
  })
})
