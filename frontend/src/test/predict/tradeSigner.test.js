/**
 * tradeSigner (spec 057, FR-019) — the eligibility seam must never produce a dead button: every
 * non-signing state carries an honest reason, and passkey capability is per-session (credential
 * pinned), not a blanket exclusion.
 */
import { describe, it, expect } from 'vitest'
import { resolveTradeSigner, PASSKEY_PREDICT_ENABLED } from '../../lib/predict/tradeSigner'

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

describe('resolveTradeSigner', () => {
  it('passkey trading is enabled by default (FR-019)', () => {
    expect(PASSKEY_PREDICT_ENABLED).toBe(true)
  })

  it('no address -> cannot sign, honest reason', () => {
    const r = resolveTradeSigner({ loginMethod: 'injected', walletClient: null, address: null })
    expect(r).toMatchObject({ canSign: false, kind: 'none' })
    expect(r.reason).toMatch(/connect/i)
  })

  it('EOA with a wallet client signs (signatureType 0 path)', () => {
    const r = resolveTradeSigner({ loginMethod: 'injected', walletClient: {}, address: ADDRESS })
    expect(r).toEqual({ canSign: true, kind: 'eoa', address: ADDRESS })
  })

  it('EOA without a wallet client cannot sign — honest reason, never a throw downstream', () => {
    const r = resolveTradeSigner({ loginMethod: 'injected', walletClient: null, address: ADDRESS })
    expect(r).toMatchObject({ canSign: false, kind: 'eoa' })
    expect(r.reason).toMatch(/connect/i)
  })

  it('passkey session with a credential signs via the ERC-1271 rail', () => {
    const r = resolveTradeSigner({ loginMethod: 'passkey', walletClient: null, address: ADDRESS, credentialId: 'cred-1' })
    expect(r).toEqual({ canSign: true, kind: 'passkey', address: ADDRESS, credentialId: 'cred-1' })
  })

  it('passkey session without a credential record gets an actionable reason — not a crash later', () => {
    const r = resolveTradeSigner({ loginMethod: 'passkey', walletClient: null, address: ADDRESS, credentialId: null })
    expect(r).toMatchObject({ canSign: false, kind: 'passkey' })
    expect(r.reason).toMatch(/sign in/i)
  })

  it('the kill seam still produces the honest "not yet" notice', () => {
    const r = resolveTradeSigner({
      loginMethod: 'passkey',
      walletClient: null,
      address: ADDRESS,
      credentialId: 'cred-1',
      enablePasskey: false,
    })
    expect(r).toMatchObject({ canSign: false, kind: 'passkey' })
    expect(r.reason).toMatch(/passkey/i)
  })
})
