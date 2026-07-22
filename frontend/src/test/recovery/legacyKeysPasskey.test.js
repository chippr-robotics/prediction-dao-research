/**
 * Biometric (passkey-PRF) protection for recovered keys (spec 062 follow-up).
 * Real WebCrypto; getAssertion is stubbed to return a fixed PRF output so the
 * round-trip, fail-closed, and unified-unlock behavior are exercised without a
 * real authenticator.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  encryptLegacySecretWithPasskey,
  decryptLegacySecretWithPasskey,
  unlockLegacySecret,
  encryptLegacySecret,
} from '../../lib/recovery/legacyKeys'

const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const prf = (fill) => new Uint8Array(32).fill(fill)
const assertionReturning = (out) => vi.fn(async () => ({ credentialId: 'cred-1', prfOutput: out }))

describe('biometric-protected legacy secret', () => {
  it('round-trips under the same passkey PRF output, storing ciphertext only', async () => {
    const entry = await encryptLegacySecretWithPasskey({
      secret: PK, kind: 'privateKey', address: ADDR, credentialId: 'cred-1',
      deps: { getAssertion: assertionReturning(prf(7)), now: 1 },
    })
    expect(entry.protection).toBe('passkey')
    expect(entry.credentialId).toBe('cred-1')
    expect(entry.salt).toBeUndefined() // no passphrase KDF material
    expect(JSON.stringify(entry)).not.toContain(PK)

    const back = await decryptLegacySecretWithPasskey({ entry, deps: { getAssertion: assertionReturning(prf(7)) } })
    expect(back).toBe(PK)
  })

  it('fails closed when the biometric yields a different PRF output', async () => {
    const entry = await encryptLegacySecretWithPasskey({
      secret: PK, kind: 'privateKey', address: ADDR, credentialId: 'cred-1',
      deps: { getAssertion: assertionReturning(prf(7)) },
    })
    await expect(
      decryptLegacySecretWithPasskey({ entry, deps: { getAssertion: assertionReturning(prf(9)) } })
    ).rejects.toThrow(/Biometric unlock/i)
  })

  it('rejects a non-PRF authenticator instead of storing weakly', async () => {
    await expect(
      encryptLegacySecretWithPasskey({
        secret: PK, kind: 'privateKey', address: ADDR, credentialId: 'cred-1',
        deps: { getAssertion: vi.fn(async () => ({ credentialId: 'cred-1' })) }, // no prfOutput
      })
    ).rejects.toThrow(/PRF unsupported/i)
  })

  it('requires a credential to protect with', async () => {
    await expect(
      encryptLegacySecretWithPasskey({ secret: PK, kind: 'privateKey', address: ADDR, credentialId: '', deps: {} })
    ).rejects.toThrow(/no passkey/i)
  })
})

describe('unlockLegacySecret (unified)', () => {
  it('runs a biometric assertion for passkey-protected entries', async () => {
    const getAssertion = assertionReturning(prf(3))
    const entry = await encryptLegacySecretWithPasskey({
      secret: PK, kind: 'privateKey', address: ADDR, credentialId: 'cred-1', deps: { getAssertion },
    })
    const back = await unlockLegacySecret({ entry, deps: { getAssertion: assertionReturning(prf(3)) } })
    expect(back).toBe(PK)
  })

  it('uses the passphrase for passphrase-protected entries', async () => {
    const entry = await encryptLegacySecret({ secret: PK, kind: 'privateKey', address: ADDR, passphrase: 'longenough' })
    expect(entry.protection).toBeUndefined() // legacy/passphrase shape
    const back = await unlockLegacySecret({ entry, passphrase: 'longenough' })
    expect(back).toBe(PK)
  })
})
