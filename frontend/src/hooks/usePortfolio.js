/**
 * usePortfolio (spec 044 + follow-up) — the connected account's holdings
 * across every network the app supports, grouped by the SEC/CFTC asset
 * taxonomy.
 *
 * Cross-chain: balances are read over each network's own read provider
 * (makeReadProvider), independent of the wallet's active chain. Testnet
 * networks are scanned only when the member enables the "show testnet
 * assets" preference. Discovery stays registry-driven (the panel discloses
 * this, FR-013).
 *
 * Honest-state rules (constitution III):
 *   - a failed read never renders as a zero balance — the asset is skipped
 *     and reported in `failedAssets`;
 *   - an asset with no trustworthy USD price gets `usd: null` and is simply
 *     excluded from USD sums (the feed's hardcoded fallback rate counts as
 *     unavailable, and the MATIC/USD feed never prices another chain's
 *     native coin);
 *   - Digital Commodities are always listed in full — a zero balance renders
 *     as a true 0 (worth $0.00), other categories list only nonzero holdings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import { useUserPreferences } from './useUserPreferences'
import { usePrice } from '../contexts/PriceContext'
import { makeReadProvider } from '../utils/rpcProvider'
import { NETWORKS } from '../config/networks'
import {
  getPortfolioRegistry,
  getPortfolioChainIds,
  getTaxonomyCategory,
  TAXONOMY_CATEGORIES,
} from '../config/assetTaxonomy'

const POLL_MS = 60_000

// Works for ERC-20 balances and ERC-721 item counts alike.
const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)']

// The app's only price feed quotes MATIC/USD (usePriceConversion), so the
// native/wrapped-native rate applies solely on MATIC-native chains. Applying
// it elsewhere (e.g. pricing ETH or ETC with a MATIC rate) would fabricate value.
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
  if (balanceRaw === 0n) {
    // Zero of anything is worth exactly $0 — no price feed required.
    usd = 0
  } else if (asset.categoryId === 'payment-stablecoins') {
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
  return { asset, balance, balanceRaw, usd, network: NETWORKS[asset.chainId]?.name || String(asset.chainId) }
}

export function usePortfolio() {
  const wallet = useWallet() || {}
  const { address, isConnected } = wallet
  const { preferences } = useUserPreferences() || {}
  const showTestnetAssets = Boolean(preferences?.showTestnetAssets)
  const price = usePrice()
  // A feed error means the exported rate is the hardcoded fallback — honest
  // portfolios treat that as "no price" rather than presenting it as real.
  const nativeUsdRate = price?.error ? null : price?.nativeUsdRate ?? null

  const chainIds = useMemo(
    () => getPortfolioChainIds({ includeTestnets: showTestnetAssets }),
    [showTestnetAssets],
  )
  // One registry entry list across all in-scope chains; entries carry their
  // chainId so nothing ever mixes across networks.
  const registry = useMemo(() => chainIds.flatMap((id) => getPortfolioRegistry(id)), [chainIds])
  const providers = useMemo(
    () => new Map(chainIds.map((id) => [id, makeReadProvider(NETWORKS[id].rpcUrl, id)])),
    [chainIds],
  )

  const [reads, setReads] = useState({ balances: null, failedAssets: [], error: null })
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!isConnected || !address || registry.length === 0) return
    const reqId = ++reqIdRef.current
    setIsLoading(true)
    // A retry after a failed load must leave the error state immediately so
    // the panel shows loading (and its Retry button goes away) instead of
    // inviting overlapping retries against a stale error.
    setReads((prev) => (prev.error ? { balances: null, failedAssets: [], error: null } : prev))
    try {
      const settled = await Promise.allSettled(
        registry.map((asset) =>
          readAssetBalance(asset, { provider: providers.get(asset.chainId), address }),
        ),
      )
      if (reqId !== reqIdRef.current) return

      const balances = new Map()
      const failedAssets = []
      settled.forEach((res, i) => {
        const asset = registry[i]
        if (res.status === 'fulfilled') {
          balances.set(`${asset.chainId}:${asset.id}`, res.value)
        } else {
          failedAssets.push(asset.symbol)
        }
      })

      if (failedAssets.length === registry.length) {
        // Nothing readable on any network — an explicit error state, never a
        // $0 portfolio.
        setReads({ balances: null, failedAssets, error: 'Unable to read balances from the supported networks.' })
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
  }, [isConnected, address, providers, registry])

  // Reset synchronously on account or scan-scope change so a stale snapshot
  // (e.g. testnet rows after the preference flips off) can never render.
  useEffect(() => {
    reqIdRef.current++
    setReads({ balances: null, failedAssets: [], error: null })
    setLastUpdated(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainIds])

  useEffect(() => {
    if (!isConnected || !address) return undefined
    const id = setInterval(() => load(), POLL_MS)
    return () => clearInterval(id)
  }, [isConnected, address, load])

  return useMemo(() => {
    let status = 'ready'
    if (!isConnected || !address) status = 'disconnected'
    else if (reads.error) status = 'error'
    else if (!reads.balances) status = 'loading'

    const holdings = []
    if (reads.balances) {
      for (const asset of registry) {
        const raw = reads.balances.get(`${asset.chainId}:${asset.id}`)
        if (raw == null) continue
        // Digital Commodities always render in full (zero balances included);
        // every other category lists only what the account actually holds.
        if (raw <= 0n && asset.categoryId !== 'digital-commodities') continue
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
        }
      })

    return {
      status,
      isLoading,
      error: reads.error,
      holdings,
      categories,
      totalUsd: holdings.reduce((sum, h) => sum + (h.usd ?? 0), 0),
      failedAssets: reads.failedAssets,
      showTestnetAssets,
      lastUpdated,
      refresh: load,
    }
  }, [registry, isConnected, address, reads, nativeUsdRate, isLoading, lastUpdated, load, showTestnetAssets])
}

export default usePortfolio
