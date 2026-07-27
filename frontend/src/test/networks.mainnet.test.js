import { describe, it, expect } from 'vitest'
import { getNetwork, getSelectableNetworks, isSupportedChainId } from '../config/networks'
import { getContractAddressForChain } from '../config/contracts'
import { getNetworkFeatures } from '../config/networkCapabilities'
import { knownDaosForChain } from '../config/clearpath/knownDaos'
import { getPortfolioChainIds } from '../config/assetTaxonomy'

// Ethereum mainnet (1) is a first-class VALUE network (spec 048): selectable, portfolio-eligible,
// send/receive-capable — plus the ClearPath DAO governance enabled since spec 042. Every app feature
// NOT deployed here (wager/DEX/passkey) still honestly self-discloses as unavailable (no fabricated
// infra); this is the invariant the tests below pin.

describe('Ethereum mainnet value network (spec 048; ClearPath since spec 042)', () => {
  it('is a supported, selectable network', () => {
    expect(isSupportedChainId(1)).toBe(true)
    expect(getSelectableNetworks().some((n) => n.chainId === 1)).toBe(true)
  })

  it('is portfolio-eligible without opting into testnets (spec 048 FR-006)', () => {
    expect(getPortfolioChainIds({ includeTestnets: false })).toContain(1)
  })

  it('enables clearpath, and — since spec 067 — swap + liquidity', () => {
    const caps = getNetwork(1).capabilities
    expect(caps.clearpath).toBe(true)
    // Spec 067 SUPERSEDES spec 048's no-in-app-swap cut on Ethereum: the DEX ships
    // wherever Uniswap is deployed. That earlier state reflected the absence of a
    // `dex` config block, not a standing product constraint (research R4a).
    expect(caps.dex).toBe(true)
    expect(caps.liquidity).toBe(true)
    expect(caps.bridge).toBe(true)
    // Still no wager infra deployed here, and no bundler configured for passkey submission —
    // both self-disclose off. Ethereum's passkey block exists (the chain carries EntryPoint v0.6
    // + the CREATE2 proxy) but stays unconfigured, so the capability is false by configuration.
    expect(caps.passkeyAccounts).toBe(false)
    expect(caps.polymarketSidebets).toBe(false)
    expect(caps.friendMarkets).toBe(false)
  })

  it('has no wager/membership deployment (features self-disable honestly)', () => {
    expect(getContractAddressForChain('wagerRegistry', 1)).toBeUndefined()
    expect(getContractAddressForChain('membershipManager', 1)).toBeUndefined()
    // A Uniswap V3 `dex` block IS configured as of spec 067 (swap + liquidity).
    expect(getNetwork(1).dex?.positionManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
    // The Network tab reflects the honest truth: wagers off, clearpath on, and — as of
    // spec 067 — swap ON (Uniswap V3 is configured here now).
    const feats = getNetworkFeatures(1)
    expect(feats.find((f) => f.key === 'wagers').deployed).toBe(false)
    expect(feats.find((f) => f.key === 'swap').deployed).toBe(true)
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
