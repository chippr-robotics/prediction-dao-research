import { describe, it, expect } from 'vitest'
import { getNetwork } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import { getNetworkFeatures } from '../../config/networkCapabilities'

// Spec 042 US1 (FR-002/FR-003, SC-001) — on a ClearPath-only network (Ethereum mainnet, 1), every non-ClearPath
// surface MUST self-disclose as unavailable rather than pretend to work. We assert the honest-disable contract
// at the mechanism level each surface gates on (per-chain capability + per-chain deployment address), so no
// surface can fabricate data on chain 1.

const CHAIN = 1

describe('ClearPath-only network self-discloses honestly (spec 042 US1)', () => {
  it('wagers: no wagerRegistry deployment → the P2P Wagers feature reads unavailable', () => {
    expect(getContractAddressForChain('wagerRegistry', CHAIN)).toBeUndefined()
    const feats = getNetworkFeatures(CHAIN)
    expect(feats.find((f) => f.key === 'wagers').deployed).toBe(false)
    expect(getNetwork(CHAIN).capabilities.friendMarkets).toBe(false)
  })

  it('swap/DEX: configured and ON as of spec 067 (supersedes the ClearPath-only cut)', () => {
    // Spec 048 shipped chain 1 without an in-app DEX because no `dex` block existed.
    // Spec 067 configures Uniswap V3 here for both swapping and liquidity supply, so
    // this network is no longer ClearPath-ONLY. The rest of the honest-disclosure
    // contract below (passkey, wagers, membership) is unchanged.
    expect(getNetwork(CHAIN).dex?.positionManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(getNetwork(CHAIN).capabilities.dex).toBe(true)
    expect(getNetworkFeatures(CHAIN).find((f) => f.key === 'swap').deployed).toBe(true)
  })

  it('passkey: capability off + no passkey config → login option hidden', () => {
    // The network declares a passkey block (spec 041 multi-network), but with no bundler URL
    // configured it resolves to null — so the capability is off and the option stays hidden.
    expect(getNetwork(CHAIN).passkey).toBeNull()
    expect(getNetwork(CHAIN).capabilities.passkeyAccounts).toBe(false)
  })

  it('membership: no membershipManager deployment → membership feature reads unavailable', () => {
    expect(getContractAddressForChain('membershipManager', CHAIN)).toBeUndefined()
    expect(getNetworkFeatures(CHAIN).find((f) => f.key === 'membership').deployed).toBe(false)
  })

  it('enables only ClearPath and swap — no wager/membership/passkey surface', () => {
    // Spec 067 adds swap alongside ClearPath. Everything else stays honestly off,
    // which is the property this test actually guards.
    const enabled = getNetworkFeatures(CHAIN).filter((f) => f.deployed).map((f) => f.key)
    expect(new Set(enabled)).toEqual(new Set(['clearpath', 'swap']))
  })
})
