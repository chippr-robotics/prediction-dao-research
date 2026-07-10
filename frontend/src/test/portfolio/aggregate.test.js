/**
 * lib/portfolio/aggregate (spec 044 v1.2, FR-025/FR-026) — wrapped-asset
 * aggregation, instance labeling, and dust-safe amount formatting.
 */
import { describe, it, expect } from 'vitest'
import {
  aggregateHoldings,
  isHomeInstance,
  instanceFormLabel,
  formatAssetAmount,
} from '../../lib/portfolio/aggregate'

function holding({ symbol, baselineSymbol, categoryId = 'digital-commodities', kind = 'erc20', chainId = 137, balance = 0, usd = null, network = 'Polygon' }) {
  return {
    asset: { id: `${symbol.toLowerCase()}`, chainId, kind, symbol, baselineSymbol, categoryId, source: 'sec-baseline' },
    balance,
    balanceRaw: BigInt(Math.round(balance * 1e6)),
    usd,
    network,
  }
}

const ETH_NATIVE_1 = holding({ symbol: 'ETH', baselineSymbol: 'ETH', kind: 'native', chainId: 1, balance: 1, usd: 2358.22, network: 'Ethereum' })
const WETH_1 = holding({ symbol: 'WETH', baselineSymbol: 'ETH', chainId: 1, balance: 0.5, usd: 1179.11, network: 'Ethereum' })
const WETH_137 = holding({ symbol: 'WETH', baselineSymbol: 'ETH', chainId: 137, balance: 0.25, usd: 589.55 })
const MATIC_NATIVE = holding({ symbol: 'MATIC', baselineSymbol: 'MATIC', kind: 'native', chainId: 137, balance: 7, usd: 3.64 })

describe('aggregateHoldings', () => {
  it('combines native and wrapped forms across chains into one underlying row (FR-025)', () => {
    const priceMap = new Map([['ETH', { usd: 2358.22, source: 'chainlink', chainId: 137 }]])
    const aggregates = aggregateHoldings([ETH_NATIVE_1, WETH_1, WETH_137, MATIC_NATIVE], priceMap)

    expect(aggregates).toHaveLength(2)
    const eth = aggregates.find((a) => a.underlying === 'ETH')
    expect(eth.name).toBe('Ethereum')
    expect(eth.instances).toHaveLength(3)
    expect(eth.balance).toBeCloseTo(1.75)
    expect(eth.usd).toBeCloseTo(2358.22 + 1179.11 + 589.55)
    expect(eth.unitPriceUsd).toBeCloseTo(2358.22)
    expect(eth.priceEntry.source).toBe('chainlink')
  })

  it('orders instances home-native first, then by chain', () => {
    const [eth] = aggregateHoldings([WETH_137, WETH_1, ETH_NATIVE_1])
    expect(eth.instances[0].asset.kind).toBe('native')
    expect(eth.instances[0].asset.chainId).toBe(1)
    expect(eth.instances.map((h) => h.asset.chainId)).toEqual([1, 1, 137])
  })

  it('keeps aggregates unpriced (usd null) when every instance is unpriced', () => {
    const [agg] = aggregateHoldings([holding({ symbol: 'WETC', baselineSymbol: 'ETC', chainId: 63, balance: 2 })])
    expect(agg.usd).toBeNull()
    expect(agg.unitPriceUsd).toBeNull()
  })

  it('never presents a partial sum: any unpriced nonzero instance makes the aggregate unpriced', () => {
    const [agg] = aggregateHoldings([
      holding({ symbol: 'ETC', baselineSymbol: 'ETC', kind: 'native', chainId: 61, balance: 0, usd: 0 }),
      holding({ symbol: 'ETC', baselineSymbol: 'ETC', kind: 'native', chainId: 63, balance: 1, usd: null }),
    ])
    expect(agg.balance).toBe(1)
    expect(agg.usd).toBeNull() // not a fabricated $0.00
  })

  it('separates the same underlying across different categories', () => {
    const aggregates = aggregateHoldings([
      holding({ symbol: 'USDC', categoryId: 'payment-stablecoins', balance: 5, usd: 5 }),
      holding({ symbol: 'USDC', categoryId: 'unclassified', chainId: 1, balance: 1, usd: null }),
    ])
    expect(aggregates).toHaveLength(2)
    // Stablecoins are par-valued; no price entry needed.
    const stable = aggregates.find((a) => a.categoryId === 'payment-stablecoins')
    expect(stable.unitPriceUsd).toBe(1)
  })
})

describe('isHomeInstance (FR-026)', () => {
  it('is true only for a native coin on its canonical mainnet', () => {
    expect(isHomeInstance(ETH_NATIVE_1.asset)).toBe(true)
    expect(isHomeInstance(WETH_1.asset)).toBe(false) // wrapped, even on home chain
    expect(isHomeInstance(MATIC_NATIVE.asset)).toBe(true)
    expect(isHomeInstance({ kind: 'native', chainId: 11155111, symbol: 'ETH', baselineSymbol: 'ETH' })).toBe(false) // testnet
  })
})

describe('instanceFormLabel', () => {
  it('labels native, wrapped, token, and collection forms', () => {
    expect(instanceFormLabel(ETH_NATIVE_1.asset)).toBe('Native')
    expect(instanceFormLabel(WETH_137.asset)).toBe('Wrapped (WETH)')
    expect(instanceFormLabel({ kind: 'erc20', symbol: 'LINK' })).toBe('Token')
    expect(instanceFormLabel({ kind: 'nft', symbol: 'FWMV' })).toBe('Collection')
  })
})

describe('formatAssetAmount', () => {
  it('floors nonzero dust instead of rounding to a misleading 0', () => {
    expect(formatAssetAmount(1e-18, 'WETH')).toBe('< 0.000001 WETH')
    expect(formatAssetAmount(0, 'ETH')).toBe('0 ETH')
    expect(formatAssetAmount(1234.5, 'USDC')).toBe('1,234.5 USDC')
    expect(formatAssetAmount(2, 'FWMV', 'nft')).toBe('2 items')
    expect(formatAssetAmount(1, 'FWMV', 'nft')).toBe('1 item')
  })
})
