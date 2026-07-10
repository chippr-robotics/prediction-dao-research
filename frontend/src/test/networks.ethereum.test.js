import { describe, it, expect } from 'vitest'
import {
  getNetwork,
  getSelectableNetworks,
  isSupportedChainId,
  listSupportedChainIds,
} from '../config/networks'
import { chains } from '../wagmi'

// Spec 048 — the Ethereum family (mainnet 1, Hoodi 560048, Sepolia 11155111) is promoted to
// user-selectable value networks. Additive + honest: no wager/DEX/passkey infra is deployed, so
// those capabilities self-disclose off. Contracts C1–C3.

const ETH_FAMILY = [1, 11155111, 560048]

describe('Ethereum family networks (spec 048)', () => {
  it('models Hoodi (560048) with the expected metadata', () => {
    expect(isSupportedChainId(560048)).toBe(true)
    const net = getNetwork(560048)
    expect(net.name).toBe('Hoodi')
    expect(net.isTestnet).toBe(true)
    expect(net.selectable).toBe(true)
    expect(net.nativeCurrency.symbol).toBe('ETH')
    expect(net.rpcUrl).toMatch(/^https?:\/\//)
    expect(net.explorer.baseUrl).toContain('etherscan')
  })

  it('has no invented Hoodi stablecoin address (honest-state — null until VITE_HOODI_USDC)', () => {
    // No canonical Hoodi faucet stablecoin is verified, so the stablecoin stays null.
    expect(getNetwork(560048).stablecoin).toBeNull()
  })

  it('makes Sepolia (11155111) a selectable Ethereum testnet', () => {
    const net = getNetwork(11155111)
    expect(net.name).toBe('Sepolia')
    expect(net.isTestnet).toBe(true)
    expect(net.selectable).toBe(true)
  })

  it('keeps Ethereum mainnet (1) a selectable mainnet value network', () => {
    const net = getNetwork(1)
    expect(net.name).toBe('Ethereum')
    expect(net.isTestnet).toBe(false)
    expect(net.selectable).toBe(true)
    expect(net.nativeCurrency.symbol).toBe('ETH')
  })

  it('surfaces every Ethereum-family network in the selectable list, mainnets before testnets', () => {
    const selectable = getSelectableNetworks()
    const ids = selectable.map((n) => n.chainId)
    for (const id of ETH_FAMILY) expect(ids).toContain(id)
    // ordering invariant: no testnet precedes a mainnet
    const firstTestnetIdx = selectable.findIndex((n) => n.isTestnet)
    const lastMainnetIdx = selectable.map((n) => n.isTestnet).lastIndexOf(false)
    expect(firstTestnetIdx).toBeGreaterThan(lastMainnetIdx)
  })

  it('enables NO app-specific capability on the Ethereum family except mainnet ClearPath', () => {
    for (const id of ETH_FAMILY) {
      const caps = getNetwork(id).capabilities
      expect(caps.dex).toBe(false)
      expect(caps.passkeyAccounts).toBe(false)
      expect(caps.polymarketSidebets).toBe(false)
      expect(caps.friendMarkets).toBe(false)
    }
    // ClearPath (spec 042) stays on for mainnet; testnets are not governance networks.
    expect(getNetwork(1).capabilities.clearpath).toBe(true)
    expect(getNetwork(11155111).capabilities.clearpath).toBe(false)
    expect(getNetwork(560048).capabilities.clearpath).toBe(false)
  })

  it('registers every selectable network in the wagmi config so switchChain can reach it', () => {
    const wagmiIds = chains.map((c) => c.id)
    for (const net of getSelectableNetworks()) {
      expect(wagmiIds).toContain(net.chainId)
    }
    // Polygon (137) stays the wagmi default chain (first) — FR-015.
    expect(chains[0].id).toBe(137)
  })

  it('does not drop any previously supported chain', () => {
    for (const id of [137, 80002, 61, 63, 1337]) {
      expect(listSupportedChainIds()).toContain(id)
    }
  })
})
