/**
 * Wrapped-asset aggregation for the portfolio (spec 044 v1.2, FR-025).
 *
 * Instances (per-chain holdings, native + wrapped forms) are combined into
 * one aggregate row per (category, underlying symbol): native ETH + WETH on
 * every scanned chain roll up into a single "Ethereum" position valued
 * together. The bottom sheet lists each instance's balance separately.
 *
 * Pure functions — no chain reads — so the grouping logic is unit-testable.
 */
import { getUnderlyingMeta } from '../../config/assetTaxonomy'
import { underlyingSymbolOf } from './prices'

// A native instance on its underlying's canonical mainnet is "at home" —
// it renders without a network badge (FR-026). Non-EVM homes (spec 061:
// native BTC on 'bitcoin') match via the string `homeNetwork` id.
export function isHomeInstance(asset) {
  const meta = getUnderlyingMeta(underlyingSymbolOf(asset))
  return (
    asset.kind === 'native' &&
    (meta.homeChainId === asset.chainId ||
      (meta.homeNetwork != null && meta.homeNetwork === asset.chainId))
  )
}

// Member-facing form label for an instance ("Native" / "Wrapped (WETH)").
export function instanceFormLabel(asset) {
  if (asset.kind === 'native') return 'Native'
  if (asset.kind === 'nft') return 'Collection'
  const underlying = underlyingSymbolOf(asset)
  if (underlying && underlying !== asset.symbol.toUpperCase()) {
    return `Wrapped (${asset.symbol})`
  }
  return 'Token'
}

// Max fraction digits shown for a fungible amount.
const FRACTION_DIGITS = 6

/**
 * Dust-safe display amount: a nonzero balance never rounds to a misleading
 * "0" (honest state) — it floors at "< 0.000001".
 */
export function formatAssetAmount(balance, symbol, kind = 'erc20') {
  if (kind === 'nft') return `${balance} ${balance === 1 ? 'item' : 'items'}`
  const value = Number(balance) || 0
  if (value > 0 && value < 10 ** -FRACTION_DIGITS) {
    return `< 0.${'0'.repeat(FRACTION_DIGITS - 1)}1 ${symbol}`
  }
  const digits = value !== 0 && Math.abs(value) < 1 ? FRACTION_DIGITS : 4
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })} ${symbol}`
}

/**
 * Group holdings into aggregates keyed by (categoryId, underlying symbol).
 *
 * @param {Array} holdings - Holding[] from usePortfolio (asset + balance + usd)
 * @param {Map<string, {usd:number, source:string, chainId:number}>} priceMap
 * @returns {Array} aggregates: {id, categoryId, underlying, name, kind,
 *   balance, usd, unitPriceUsd, priceEntry, instances[]}
 */
export function aggregateHoldings(holdings, priceMap = new Map()) {
  const byKey = new Map()
  for (const holding of holdings) {
    const underlying = underlyingSymbolOf(holding.asset) || holding.asset.symbol.toUpperCase()
    const key = `${holding.asset.categoryId}|${underlying}`
    let agg = byKey.get(key)
    if (!agg) {
      const priceEntry =
        holding.asset.categoryId === 'payment-stablecoins' ? null : priceMap.get(underlying) || null
      agg = {
        id: key,
        categoryId: holding.asset.categoryId,
        underlying,
        name: getUnderlyingMeta(underlying).name,
        kind: holding.asset.kind === 'nft' ? 'nft' : 'fungible',
        balance: 0,
        usd: null,
        unitPriceUsd:
          holding.asset.categoryId === 'payment-stablecoins' ? 1 : priceEntry?.usd ?? null,
        priceEntry,
        instances: [],
      }
      byKey.set(key, agg)
    }
    agg.instances.push(holding)
    agg.balance += holding.balance
  }

  // Aggregate USD: zero-balance instances are neutral; if any NONZERO
  // instance is unpriced the aggregate is unpriced (usd null) — summing only
  // the priced part would present an incomplete figure as the position's
  // value. All-zero aggregates are honestly worth $0.00.
  for (const agg of byKey.values()) {
    const nonzero = agg.instances.filter((h) => h.balance > 0)
    if (nonzero.length === 0) {
      agg.usd = 0
    } else if (nonzero.some((h) => h.usd == null)) {
      agg.usd = null
    } else {
      agg.usd = nonzero.reduce((sum, h) => sum + h.usd, 0)
    }
  }

  // Stable ordering: home/native instances first, then mainnets, then
  // testnets, then by chain id — so the sheet reads naturally.
  for (const agg of byKey.values()) {
    agg.instances.sort((a, b) => {
      const home = Number(isHomeInstance(b.asset)) - Number(isHomeInstance(a.asset))
      if (home !== 0) return home
      const native = Number(b.asset.kind === 'native') - Number(a.asset.kind === 'native')
      if (native !== 0) return native
      return a.asset.chainId - b.asset.chainId
    })
  }

  return Array.from(byKey.values())
}
