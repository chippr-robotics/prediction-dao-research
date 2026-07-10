/**
 * usePortfolio (spec 044) — live, per-network holdings of the connected
 * account, grouped by the SEC/CFTC asset taxonomy.
 *
 * Discovery is registry-driven: only assets in getPortfolioRegistry(chainId)
 * are scanned (the panel discloses this, FR-013). Balances are read live from
 * the wallet context's read provider; nothing is persisted. Honest-state
 * rules (constitution III):
 *   - a zero balance is not a holding;
 *   - a failed read is reported in `failedAssets` and marks the snapshot
 *     partial — it is never rendered as a zero balance;
 *   - an asset with no trustworthy USD price gets `usd: null`, is excluded
 *     from totals, and flips `isPartial` (FR-010) — the price feed's
 *     hardcoded fallback rate is treated as unavailable, and the MATIC/USD
 *     feed is never applied to another chain's native coin.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import { usePrice } from '../contexts/PriceContext'
import { getPortfolioRegistry, getTaxonomyCategory, TAXONOMY_CATEGORIES } from '../config/assetTaxonomy'

const POLL_MS = 60_000

// Works for ERC-20 balances and ERC-721 item counts alike.
const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)']

// The app's only price feed quotes MATIC/USD (usePriceConversion), so the
// native/wrapped-native rate applies solely on MATIC-native chains. Applying
// it elsewhere (e.g. pricing ETC with a MATIC rate) would fabricate value.
const PRICE_FEED_NATIVE_SYMBOLS = new Set(['MATIC', 'POL'])

async function readAssetBalance(asset, { provider, address }) {
  if (asset.kind === 'native') {
    return provider.getBalance(address)
  }
  const token = new Contract(asset.address, BALANCE_OF_ABI, provider)
  return token.balanceOf(address)
}

function toHolding(asset, balanceRaw, { nativeUsdRate }) {
  const balance =
    asset.kind === 'nft' ? Number(balanceRaw) : Number(formatUnits(balanceRaw, asset.decimals))

  let usd = null
  if (asset.categoryId === 'payment-stablecoins') {
    // Par $1 — the app-wide stablecoin convention (see useAccountStats).
    usd = balance
  } else if (
    asset.kind !== 'nft' &&
    nativeUsdRate != null &&
    asset.baselineSymbol &&
    PRICE_FEED_NATIVE_SYMBOLS.has(asset.baselineSymbol.toUpperCase())
  ) {
    usd = balance * nativeUsdRate
  }
  return { asset, balance, balanceRaw, usd }
}

export function usePortfolio() {
  const wallet = useWallet() || {}
  const { address, chainId, isConnected, provider } = wallet
  const price = usePrice()
  // A feed error means the exported rate is the hardcoded fallback — honest
  // portfolios treat that as "no price" rather than presenting it as real.
  const nativeUsdRate = price?.error ? null : price?.nativeUsdRate ?? null

  const registry = useMemo(() => getPortfolioRegistry(chainId), [chainId])

  const [reads, setReads] = useState({ balances: null, failedAssets: [], error: null })
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!isConnected || !address || !provider || registry.length === 0) return
    const reqId = ++reqIdRef.current
    setIsLoading(true)
    try {
      const settled = await Promise.allSettled(
        registry.map((asset) => readAssetBalance(asset, { provider, address })),
      )
      if (reqId !== reqIdRef.current) return

      const balances = new Map()
      const failedAssets = []
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          balances.set(registry[i].id, res.value)
        } else {
          failedAssets.push(registry[i].symbol)
        }
      })

      if (failedAssets.length === registry.length) {
        // Nothing readable — an explicit error state, never a $0 portfolio.
        setReads({ balances: null, failedAssets, error: 'Unable to read balances from the network.' })
      } else {
        setReads({ balances, failedAssets, error: null })
        setLastUpdated(Date.now())
      }
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      setReads({ balances: null, failedAssets: [], error: err?.message || 'Failed to load portfolio' })
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false)
    }
  }, [isConnected, address, provider, registry])

  // Reset synchronously on account/network change so a stale snapshot from
  // another chain can never render (SC-004), then reload.
  useEffect(() => {
    reqIdRef.current++
    setReads({ balances: null, failedAssets: [], error: null })
    setLastUpdated(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId])

  useEffect(() => {
    if (!isConnected || !address) return undefined
    const id = setInterval(() => load(), POLL_MS)
    return () => clearInterval(id)
  }, [isConnected, address, load])

  return useMemo(() => {
    const supported = registry.length > 0

    let status = 'ready'
    if (!isConnected || !address) status = 'disconnected'
    else if (reads.error) status = 'error'
    // An unsupported network never loads — the panel renders its explicit
    // state off isSupportedNetwork instead (FR-014).
    else if (!reads.balances && supported) status = 'loading'

    const holdings = []
    if (reads.balances) {
      for (const asset of registry) {
        const raw = reads.balances.get(asset.id)
        if (raw == null || raw <= 0n) continue
        holdings.push(toHolding(asset, raw, { nativeUsdRate }))
      }
    }

    const byCategory = new Map()
    for (const h of holdings) {
      const list = byCategory.get(h.asset.categoryId) || []
      list.push(h)
      byCategory.set(h.asset.categoryId, list)
    }
    const categories = TAXONOMY_CATEGORIES
      // The regulatory categories always render; Unclassified only when it
      // actually holds something (FR-012).
      .filter((cat) => cat.id !== 'unclassified' || (byCategory.get(cat.id) || []).length > 0)
      .map((cat) => {
        const catHoldings = byCategory.get(cat.id) || []
        return {
          category: getTaxonomyCategory(cat.id),
          holdings: catHoldings,
          subtotalUsd: catHoldings.reduce((sum, h) => sum + (h.usd ?? 0), 0),
          isPartial: catHoldings.some((h) => h.usd == null),
        }
      })

    return {
      status,
      isSupportedNetwork: supported,
      isLoading,
      error: reads.error,
      holdings,
      categories,
      totalUsd: holdings.reduce((sum, h) => sum + (h.usd ?? 0), 0),
      isPartial: holdings.some((h) => h.usd == null) || reads.failedAssets.length > 0,
      failedAssets: reads.failedAssets,
      lastUpdated,
      refresh: load,
    }
  }, [registry, isConnected, address, reads, nativeUsdRate, isLoading, lastUpdated, load])
}

export default usePortfolio
