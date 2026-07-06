import { describe, it, expect } from 'vitest'
import { getNetwork, getSelectableNetworks, isSupportedChainId } from '../config/networks'
import { getContractAddressForChain } from '../config/contracts'
import { getNetworkFeatures } from '../config/networkCapabilities'
import { knownDaosForChain } from '../config/clearpath/knownDaos'

// Spec 042 US1 — Ethereum mainnet (1) is a ClearPath-ONLY network: DAO governance is the only enabled
// capability, and every other feature honestly self-discloses as unavailable (no fabricated infra).

describe('Ethereum mainnet ClearPath-only network (spec 042 US1)', () => {
  it('is a supported, selectable network', () => {
    expect(isSupportedChainId(1)).toBe(true)
    expect(getSelectableNetworks().some((n) => n.chainId === 1)).toBe(true)
  })

  it('enables ONLY clearpath among capabilities', () => {
    const caps = getNetwork(1).capabilities
    expect(caps.clearpath).toBe(true)
    expect(caps.dex).toBe(false)
    expect(caps.passkeyAccounts).toBe(false)
    expect(caps.polymarketSidebets).toBe(false)
    expect(caps.friendMarkets).toBe(false)
  })

  it('has no wager/membership/DEX deployment (features self-disable honestly)', () => {
    expect(getContractAddressForChain('wagerRegistry', 1)).toBeUndefined()
    expect(getContractAddressForChain('membershipManager', 1)).toBeUndefined()
    expect(getNetwork(1).dex).toBeNull()
    // The Network tab reflects the honest truth: wagers/swap off, clearpath on.
    const feats = getNetworkFeatures(1)
    expect(feats.find((f) => f.key === 'wagers').deployed).toBe(false)
    expect(feats.find((f) => f.key === 'swap').deployed).toBe(false)
    expect(feats.find((f) => f.key === 'clearpath').deployed).toBe(true)
  })

  it('carries the metadata ClearPath needs (RPC, USDC for treasury reads, explorer)', () => {
    const net = getNetwork(1)
    expect(net.rpcUrl).toMatch(/^https?:\/\//)
    expect(net.stablecoin?.decimals).toBe(6)
    expect(net.explorer?.baseUrl).toContain('etherscan')
  })

  it('seeds the verified ENS (OZ) and Uniswap (Bravo) DAOs so they surface by default', () => {
    const known = knownDaosForChain(1)
    const ens = known.find((d) => /ENS/i.test(d.label))
    const uni = known.find((d) => /Uniswap/i.test(d.label))
    expect(ens?.framework).toBe(0) // OpenZeppelin Governor
    expect(uni?.framework).toBe(1) // Governor Bravo
    // Addresses are the on-chain-verified governors (checksummed).
    expect(ens.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(uni.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})
