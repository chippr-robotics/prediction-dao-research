/**
 * Spec 041 T017 — credential ceremonies: success/cancel/unavailable branches,
 * duplicate-signup steering, capability matrix. Authenticator fully stubbed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createCredential,
  getAssertion,
  detectCapability,
  hasExistingCredential,
  rememberCredential,
  forgetCredential,
  knownCredentials,
  CeremonyCancelled,
  AuthenticatorUnavailable,
} from '../credentials'

// Minimal fake SPKI: 26-byte DER header + uncompressed point 0x04||x||y.
function fakeSpki(xByte = 0x11, yByte = 0x22) {
  const spki = new Uint8Array(26 + 65)
  spki[26] = 0x04
  spki.fill(xByte, 27, 59)
  spki.fill(yByte, 59, 91)
  return spki.buffer
}

function fakeCreatedCredential({ prf = true } = {}) {
  return {
    id: 'cred-abc',
    response: { getPublicKey: () => fakeSpki() },
    getClientExtensionResults: () => (prf ? { prf: { enabled: true } } : {}),
  }
}

describe('createCredential', () => {
  it('returns credentialId, P-256 coordinates, and PRF capability', async () => {
    const credentials = { create: vi.fn().mockResolvedValue(fakeCreatedCredential()) }
    const entry = await createCredential({ label: 'Phone', deps: { credentials } })
    expect(entry.credentialId).toBe('cred-abc')
    expect(entry.publicKey.x).toMatch(/^0x11{1}/)
    expect(entry.publicKey.x).toHaveLength(66)
    expect(entry.publicKey.y).toHaveLength(66)
    expect(entry.prfCapable).toBe(true)
    expect(entry.label).toBe('Phone')
    // PRF requested at creation (FR-012) + discoverable resident key required.
    const arg = credentials.create.mock.calls[0][0].publicKey
    expect(arg.extensions.prf).toBeTruthy()
    expect(arg.authenticatorSelection.residentKey).toBe('required')
  })

  it('reports prfCapable=false when the authenticator lacks PRF (degradation input)', async () => {
    const credentials = { create: vi.fn().mockResolvedValue(fakeCreatedCredential({ prf: false })) }
    const entry = await createCredential({ deps: { credentials } })
    expect(entry.prfCapable).toBe(false)
  })

  it('maps a dismissed prompt to CeremonyCancelled (clean abort, no partial state)', async () => {
    const err = Object.assign(new Error('user cancelled'), { name: 'NotAllowedError' })
    const credentials = { create: vi.fn().mockRejectedValue(err) }
    await expect(createCredential({ deps: { credentials } })).rejects.toBeInstanceOf(CeremonyCancelled)
  })

  it('maps missing WebAuthn support to AuthenticatorUnavailable', async () => {
    const err = Object.assign(new Error('nope'), { name: 'NotSupportedError' })
    const credentials = { create: vi.fn().mockRejectedValue(err) }
    await expect(createCredential({ deps: { credentials } })).rejects.toBeInstanceOf(AuthenticatorUnavailable)
  })
})

describe('getAssertion', () => {
  const fakeAssertion = {
    id: 'cred-abc',
    response: {
      signature: new Uint8Array([1]).buffer,
      authenticatorData: new Uint8Array([2]).buffer,
      clientDataJSON: new Uint8Array([3]).buffer,
    },
    getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).buffer } } }),
  }

  it('pins the credential when credentialId is given, and surfaces PRF output', async () => {
    const credentials = { get: vi.fn().mockResolvedValue(fakeAssertion) }
    const out = await getAssertion({
      challenge: new Uint8Array(32),
      credentialId: 'Y3JlZC1hYmM',
      prfSalt: new Uint8Array(32),
      deps: { credentials },
    })
    expect(out.credentialId).toBe('cred-abc')
    expect(out.prfOutput).toBeInstanceOf(Uint8Array)
    const arg = credentials.get.mock.calls[0][0].publicKey
    expect(arg.allowCredentials).toHaveLength(1)
    expect(arg.userVerification).toBe('required')
  })

  it('leaves credential selection to the platform picker when unpinned (never guesses)', async () => {
    const credentials = { get: vi.fn().mockResolvedValue(fakeAssertion) }
    await getAssertion({ challenge: new Uint8Array(32), deps: { credentials } })
    expect(credentials.get.mock.calls[0][0].publicKey.allowCredentials).toBeUndefined()
  })

  it('maps cancellation to CeremonyCancelled', async () => {
    const err = Object.assign(new Error('abort'), { name: 'AbortError' })
    const credentials = { get: vi.fn().mockRejectedValue(err) }
    await expect(getAssertion({ challenge: new Uint8Array(32), deps: { credentials } })).rejects.toBeInstanceOf(
      CeremonyCancelled
    )
  })
})

describe('capability detection (FR-004)', () => {
  it('unavailable without PublicKeyCredential', async () => {
    const out = await detectCapability({ window: {}, navigator: {} })
    expect(out.available).toBe(false)
    expect(out.reason).toMatch(/support/i)
  })

  it('available with a platform authenticator', async () => {
    const env = {
      window: { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true } },
      navigator: { credentials: {} },
    }
    const out = await detectCapability(env)
    expect(out).toEqual({ available: true, platformAuthenticator: true })
  })

  it('available-but-hybrid without a platform authenticator', async () => {
    const env = {
      window: { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => false } },
      navigator: { credentials: {} },
    }
    const out = await detectCapability(env)
    expect(out).toEqual({ available: true, platformAuthenticator: false })
  })
})

describe('duplicate-signup steering + local credential book-keeping', () => {
  beforeEach(() => localStorage.clear())

  it('steers to sign-in when a credential already exists', () => {
    expect(hasExistingCredential()).toBe(false)
    rememberCredential({ credentialId: 'c1', publicKey: { x: '0x1', y: '0x2' }, prfCapable: true })
    expect(hasExistingCredential()).toBe(true)
    expect(knownCredentials()).toHaveLength(1)
  })

  it('forgets a credential (controller removal pairing)', () => {
    rememberCredential({ credentialId: 'c1' })
    rememberCredential({ credentialId: 'c2' })
    forgetCredential('c1')
    expect(knownCredentials().map((c) => c.credentialId)).toEqual(['c2'])
  })
})
