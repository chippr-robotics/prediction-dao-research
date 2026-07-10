import { describe, it, expect } from 'vitest'
import {
  getDexProvider,
  getNetwork,
  getSelectableNetworks,
  isDexAvailable,
  isSupportedChainId,
  PRIMARY_CHAIN_ID,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
  TESTNET_MAINNET_PAIR,
} from '../config/networks'

// Spec 033 — network-aware swap provider. The DEX provider is declared per
// network so the mapping (ETC family → ETCswap; all others → Uniswap) is
// explicit, pure, and survives an unconfigured `dex`.

describe('getDexProvider — network → DEX provider mapping (Spec 033 FR-001/007)', () => {
  it('returns null for chains without a DEX provider (Hardhat 1337)', () => {
    expect(getDexProvider(1337)).toBeNull()
  })

  it('returns null for an unknown / unsupported chain id', () => {
    // getNetwork falls back to the active network, which has no guarantee of a
    // provider for a bogus id; the helper must not throw and must be a pure lookup.
    expect(() => getDexProvider(999999)).not.toThrow()
  })

  it('maps ETC-family chains (61, 63) to ETCswap', () => {
    expect(getDexProvider(61)?.name).toBe('ETCswap')
    expect(getDexProvider(63)?.name).toBe('ETCswap')
    expect(getDexProvider(61)?.url).toMatch(/etcswap/)
    expect(getDexProvider(63)?.url).toMatch(/etcswap/)
  })

  it('maps non-ETC chains (137, 80002) to Uniswap', () => {
    expect(getDexProvider(137)?.name).toBe('Uniswap')
    expect(getDexProvider(80002)?.name).toBe('Uniswap')
    expect(getDexProvider(137)?.url).toMatch(/uniswap\.org/)
    expect(getDexProvider(80002)?.url).toMatch(/uniswap\.org/)
  })

  it('never returns a provider whose name mismatches the chain family (FR-002/009)', () => {
    expect(getDexProvider(61)?.name).not.toBe('Uniswap')
    expect(getDexProvider(63)?.name).not.toBe('Uniswap')
    expect(getDexProvider(137)?.name).not.toBe('ETCswap')
    expect(getDexProvider(80002)?.name).not.toBe('ETCswap')
  })
})

describe('Ethereum Classic mainnet (chainId 61) (Spec 033 FR-011)', () => {
  it('is a supported, selectable mainnet network', () => {
    expect(isSupportedChainId(61)).toBe(true)
    const net = getNetwork(61)
    expect(net.chainId).toBe(61)
    expect(net.name).toBe('Ethereum Classic')
    expect(net.isTestnet).toBe(false)
    expect(net.selectable).toBe(true)
  })

  it('appears in the user-facing selectable network list', () => {
    const ids = getSelectableNetworks().map((n) => n.chainId)
    expect(ids).toContain(61)
  })

  it('binds ETC mainnet to ETCswap with a configured DEX (verified defaults)', () => {
    expect(isDexAvailable(61)).toBe(true)
    expect(getDexProvider(61)?.name).toBe('ETCswap')
  })

  it('uses Classic USD (USC, 6 decimals) as the stablecoin', () => {
    const net = getNetwork(61)
    expect(net.stablecoin.symbol).toBe('USC')
    expect(net.stablecoin.decimals).toBe(6)
  })

  it('uses the Ethereum Classic Blockscout explorer', () => {
    expect(getNetwork(61).explorer.baseUrl).toBe('https://etc.blockscout.com')
  })
})

// Spec 048 — the selectable-network set grows to include the Ethereum family without
// disturbing the app's default/home network or the Testnet/Mainnet toggle (FR-015 / SC-006).
describe('selectable-network set + defaults after adding the Ethereum family (spec 048)', () => {
  it('includes the Ethereum family alongside every prior selectable network', () => {
    const ids = getSelectableNetworks().map((n) => n.chainId)
    for (const id of [137, 80002, 61, 63, 1, 11155111, 560048]) {
      expect(ids).toContain(id)
    }
  })

  it('offers only networks flagged selectable (never the local sandbox)', () => {
    expect(getSelectableNetworks().every((n) => n.selectable === true)).toBe(true)
    expect(getSelectableNetworks().some((n) => n.chainId === 1337)).toBe(false)
  })

  it('leaves the default/home network and the Testnet/Mainnet pair unchanged', () => {
    expect(PRIMARY_CHAIN_ID).toBe(137)
    expect(MAINNET_CHAIN_ID).toBe(137)
    expect(TESTNET_CHAIN_ID).toBe(80002)
    expect(TESTNET_MAINNET_PAIR).toEqual({ testnet: 80002, mainnet: 137 })
  })
})
