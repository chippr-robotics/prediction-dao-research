/**
 * Passkey ERC-1271 order signing (spec 056 FR-019 / SC-009).
 *
 * A passkey seller signs the Seaport order through the SAME signTypedData seam; the injected
 * passkeyIntentSigner produces the ERC-1271 envelope (over replaySafeHash — verified in the passkey
 * unit tests). Until end-to-end OpenSea validation is confirmed, the resolver keeps passkey selling
 * behind the honest-unavailable fallback (never a dead button).
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveOrderSigner, PASSKEY_SELL_ENABLED } from '../../lib/collectibles/orderSigner'

const SELLER = '0xAccountAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'.slice(0, 42)

describe('resolveOrderSigner', () => {
  it('signs with the EOA wallet signer for an EOA session', async () => {
    const signer = { signTypedData: vi.fn().mockResolvedValue('0xeoasig') }
    const r = resolveOrderSigner({ loginMethod: 'wallet', signer, address: SELLER, chainId: 137 })
    expect(r.canSign).toBe(true)
    expect(r.kind).toBe('eoa')
    expect(await r.sign({ d: 1 }, { t: 1 }, { m: 1 })).toBe('0xeoasig')
    expect(signer.signTypedData).toHaveBeenCalledWith({ d: 1 }, { t: 1 }, { m: 1 })
  })

  it('honestly reports unavailable for a passkey session while gated (FR-019) — never a dead button', () => {
    const r = resolveOrderSigner({ loginMethod: 'passkey', signer: null, address: SELLER, chainId: 137 })
    expect(r.canSign).toBe(false)
    expect(r.kind).toBe('passkey')
    expect(r.reason).toMatch(/passkey/i)
    // Ships gated by default until OpenSea ERC-1271 validation is confirmed end-to-end (research D3).
    expect(PASSKEY_SELL_ENABLED).toBe(false)
  })

  it('when enabled, signs a passkey order via the ERC-1271 adapter (the SAME signTypedData shape)', async () => {
    const ps = { signTypedData: vi.fn().mockResolvedValue('0x1271envelope') }
    const makePasskeySigner = vi.fn(() => ps)
    const r = resolveOrderSigner({
      loginMethod: 'passkey',
      signer: null,
      address: SELLER,
      chainId: 137,
      passkey: { credentialId: 'cred-1', ownerIndex: 2 },
      enablePasskey: true,
      makePasskeySigner,
    })
    expect(r.canSign).toBe(true)
    expect(r.kind).toBe('passkey')
    expect(makePasskeySigner).toHaveBeenCalledWith({ chainId: 137, address: SELLER, credentialId: 'cred-1', ownerIndex: 2 })
    const domain = { name: 'Seaport' }
    const sig = await r.sign(domain, { OrderComponents: [] }, { offerer: SELLER })
    expect(sig).toBe('0x1271envelope')
    // The adapter (not this seam) applies replaySafeHash; here we prove the order flows through it.
    expect(ps.signTypedData).toHaveBeenCalledWith(domain, { OrderComponents: [] }, { offerer: SELLER })
  })

  it('falls back to honest-unavailable when a passkey account lacks a credential (per-account, FR-019)', () => {
    const r = resolveOrderSigner({ loginMethod: 'passkey', signer: null, address: SELLER, chainId: 137, passkey: {}, enablePasskey: true })
    expect(r.canSign).toBe(false)
    expect(r.reason).toMatch(/passkey account yet/i)
  })
})
