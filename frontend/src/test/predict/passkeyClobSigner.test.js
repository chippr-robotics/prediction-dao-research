/**
 * passkeyClobSigner (spec 057, FR-019) — the clob-client signer shim for passkey smart accounts:
 * resolves the SESSION credential and its real owner slot, then delegates every `_signTypedData` to
 * the ONE ERC-1271 envelope implementation (lib/passkey/intentSigner). All collaborators injected.
 */
import { describe, it, expect, vi } from 'vitest'
import { makePasskeyClobSigner } from '../../lib/predict/passkeyClobSigner'
import { CredentialRecordIncomplete } from '../../lib/passkey/smartAccount'

const ACCOUNT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const CRED = {
  credentialId: 'cred-1',
  address: ACCOUNT,
  publicKey: { x: `0x${'11'.repeat(32)}`, y: `0x${'22'.repeat(32)}` },
}

function makeDeps(over = {}) {
  const inner = {
    getAddress: vi.fn().mockResolvedValue(ACCOUNT),
    signTypedData: vi.fn().mockResolvedValue('0xenvelope'),
  }
  return {
    inner,
    deps: {
      knownCredentials: vi.fn(() => [CRED]),
      resolveOwnerIndex: vi.fn().mockResolvedValue(2),
      passkeyIntentSigner: vi.fn(() => inner),
      ...over,
    },
  }
}

describe('makePasskeyClobSigner', () => {
  it('pins the session credential, resolves the real owner slot, and exposes the ethers duck type', async () => {
    const { inner, deps } = makeDeps()
    const signer = await makePasskeyClobSigner({ chainId: 137, address: ACCOUNT, credentialId: 'cred-1', deps })

    expect(deps.resolveOwnerIndex).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 137, accountAddress: ACCOUNT, credential: CRED })
    )
    expect(deps.passkeyIntentSigner).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 137, address: ACCOUNT, credentialId: 'cred-1', ownerIndex: 2 })
    )

    await expect(signer.getAddress()).resolves.toBe(ACCOUNT)
    const domain = { name: 'ClobAuthDomain', version: '1', chainId: 137 }
    const types = { ClobAuth: [{ name: 'address', type: 'address' }] }
    const value = { address: ACCOUNT }
    await expect(signer._signTypedData(domain, types, value)).resolves.toBe('0xenvelope')
    expect(inner.signTypedData).toHaveBeenCalledWith(domain, types, value)
  })

  it('falls back to the address match when the session credentialId is unknown (older sessions)', async () => {
    const { deps } = makeDeps()
    await makePasskeyClobSigner({ chainId: 137, address: ACCOUNT, credentialId: 'other', deps })
    expect(deps.passkeyIntentSigner).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'cred-1' }))
  })

  it('refuses when no credential is linked — actionable message, before any ceremony', async () => {
    const { deps } = makeDeps({ knownCredentials: vi.fn(() => []) })
    await expect(makePasskeyClobSigner({ chainId: 137, address: ACCOUNT, credentialId: 'cred-1', deps })).rejects.toThrow(
      /sign in again/i
    )
  })

  it('refuses an incomplete credential record (spec 045 FR-006)', async () => {
    const { deps } = makeDeps({
      knownCredentials: vi.fn(() => [{ credentialId: 'cred-1', address: ACCOUNT }]), // no publicKey
    })
    await expect(makePasskeyClobSigner({ chainId: 137, address: ACCOUNT, credentialId: 'cred-1', deps })).rejects.toThrow(
      CredentialRecordIncomplete
    )
  })
})
