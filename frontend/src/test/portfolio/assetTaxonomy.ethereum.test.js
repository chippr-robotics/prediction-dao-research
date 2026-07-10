import { describe, it, expect } from 'vitest'
import { getPortfolioRegistry, getPortfolioChainIds } from '../../config/assetTaxonomy'
import { CHAINLINK_FEEDS } from '../../config/priceFeeds'

// Spec 048 (contracts C6–C8) — the cross-network portfolio includes the Ethereum family with a
// curated multi-token set, gates testnets behind the opt-in, and prices ETH/WETH from a
// verifiable Chainlink feed (mainnet has no in-app DEX, so the feed is the required source).

describe('Ethereum-mainnet portfolio registry (spec 048 FR-006/006a)', () => {
  const entries = getPortfolioRegistry(1)
  const bySymbol = new Map(entries.map((e) => [e.symbol, e]))

  it('yields the curated multi-token set: native ETH + WETH + USDC + USDT + DAI', () => {
    for (const sym of ['ETH', 'WETH', 'USDC', 'USDT', 'DAI']) {
      expect(bySymbol.has(sym)).toBe(true)
    }
  })

  it('classifies commodities and stablecoins correctly', () => {
    expect(bySymbol.get('ETH').categoryId).toBe('digital-commodities') // SEC baseline
    expect(bySymbol.get('WETH').categoryId).toBe('digital-commodities')
    expect(bySymbol.get('USDC').categoryId).toBe('payment-stablecoins')
    expect(bySymbol.get('USDT').categoryId).toBe('payment-stablecoins')
    expect(bySymbol.get('DAI').categoryId).toBe('payment-stablecoins')
  })

  it('carries chainId 1 on every entry and no empty address on ERC-20s', () => {
    for (const e of entries) {
      expect(e.chainId).toBe(1)
      if (e.kind !== 'native') expect(e.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})

describe('portfolio chain scope with the Ethereum family (spec 048 FR-006/FR-007)', () => {
  it('includes mainnet (1) by default and excludes the Ethereum testnets', () => {
    const ids = getPortfolioChainIds({ includeTestnets: false })
    expect(ids).toContain(1)
    expect(ids).not.toContain(11155111)
    expect(ids).not.toContain(560048)
  })

  it('includes Hoodi + Sepolia only when testnet assets are enabled', () => {
    const ids = getPortfolioChainIds({ includeTestnets: true })
    expect(ids).toContain(11155111)
    expect(ids).toContain(560048)
  })

  it('never scans the local sandbox', () => {
    expect(getPortfolioChainIds({ includeTestnets: true })).not.toContain(1337)
  })
})

describe('Ethereum-mainnet pricing source (spec 048 FR-008/FR-014, contract C8)', () => {
  it('exposes a Chainlink ETH/USD feed so ETH and WETH can be priced', () => {
    expect(CHAINLINK_FEEDS[1]?.ETH).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('does not provide feeds for stablecoins (valued at par $1, not via a feed)', () => {
    expect(CHAINLINK_FEEDS[1]?.USDC).toBeUndefined()
    expect(CHAINLINK_FEEDS[1]?.USDT).toBeUndefined()
    expect(CHAINLINK_FEEDS[1]?.DAI).toBeUndefined()
  })
})

// Hoodi has no verified stablecoin, so its registry is native-only (no empty-address entry).
describe('Hoodi portfolio registry stays honest without a stablecoin (spec 048)', () => {
  it('yields the native entry and no empty-address stablecoin', () => {
    const entries = getPortfolioRegistry(560048)
    expect(entries.some((e) => e.kind === 'native' && e.symbol === 'ETH')).toBe(true)
    expect(entries.every((e) => e.kind === 'native' || /^0x[0-9a-fA-F]{40}$/.test(e.address))).toBe(true)
  })
})
