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

  it('swap/DEX: no dex config + capability off → swap surface hidden', () => {
    expect(getNetwork(CHAIN).dex).toBeNull()
    expect(getNetwork(CHAIN).capabilities.dex).toBe(false)
    expect(getNetworkFeatures(CHAIN).find((f) => f.key === 'swap').deployed).toBe(false)
  })

  it('passkey: capability off + no passkey config → login option hidden', () => {
    expect(getNetwork(CHAIN).passkey).toBeNull()
    expect(getNetwork(CHAIN).capabilities.passkeyAccounts).toBe(false)
  })

  it('membership: no membershipManager deployment → membership feature reads unavailable', () => {
    expect(getContractAddressForChain('membershipManager', CHAIN)).toBeUndefined()
    expect(getNetworkFeatures(CHAIN).find((f) => f.key === 'membership').deployed).toBe(false)
  })

  it('the ONLY enabled surface is ClearPath', () => {
    const enabled = getNetworkFeatures(CHAIN).filter((f) => f.deployed).map((f) => f.key)
    expect(enabled).toEqual(['clearpath'])
  })
})
