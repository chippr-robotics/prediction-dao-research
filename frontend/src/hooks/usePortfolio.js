/**
 * usePortfolio (spec 044 v1.2) — the connected account's holdings across
 * every supported network, grouped by the SEC/CFTC asset taxonomy and
 * aggregated per underlying asset (native + wrapped forms combined, FR-025).
 *
 * Cross-chain: balances are read over each network's own read provider
 * (makeReadProvider), independent of the wallet's active chain. Testnet
 * networks are scanned only when the member enables the "show testnet
 * assets" preference. Discovery stays registry-driven (the panel discloses
 * this, FR-013).
 *
 * Pricing (FR-022): USD values come from verifiable on-chain sources —
 * Chainlink feeds first, then DEX pool spot vs the network stablecoin
 * (lib/portfolio/prices.js); stablecoins at par $1. Honest-state rules
 * (constitution III):
 *   - a failed balance read never renders as zero — the asset is skipped
 *     and reported in `failedAssets`;
 *   - an asset with no resolvable on-chain price gets `usd: null` and is
 *     excluded from USD sums;
 *   - zero of anything is worth exactly $0.00 (no price feed required).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import { useUserPreferences } from './useUserPreferences'
import { makeReadProvider } from '../utils/rpcProvider'
import { NETWORKS } from '../config/networks'
import {
  getPortfolioRegistry,
  getPortfolioChainIds,
  getTaxonomyCategory,
  getBitcoinPortfolioAsset,
  TAXONOMY_CATEGORIES,
} from '../config/assetTaxonomy'
import { fetchPortfolioPrices, underlyingSymbolOf } from '../lib/portfolio/prices'
import { aggregateHoldings } from '../lib/portfolio/aggregate'
import { loadBitcoinHoldings, toBitcoinHolding } from '../lib/bitcoin/portfolioSource'
import { createBitcoinGatewayClient, bitcoinGatewayUrl } from '../lib/bitcoin/gatewayClient'

const POLL_MS = 60_000

// Works for ERC-20 balances and ERC-721 item counts alike.
const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)']

async function readAssetBalance(asset, { provider, address }) {
  if (asset.kind === 'native') {
    return provider.getBalance(address)
  }
  const token = new Contract(asset.address, BALANCE_OF_ABI, provider)
  return token.balanceOf(address)
}

function toHolding(asset, balanceRaw, priceMap) {
  const balance =
    asset.kind === 'nft' ? Number(balanceRaw) : Number(formatUnits(balanceRaw, asset.decimals))

  let usd = null
  if (balanceRaw === 0n) {
    // Zero of anything is worth exactly $0 — no price feed required.
    usd = 0
  } else if (asset.categoryId === 'payment-stablecoins') {
    // Par $1 — the app-wide stablecoin convention (see useAccountStats).
    usd = balance
  } else if (asset.kind !== 'nft') {
    const price = priceMap.get(underlyingSymbolOf(asset))
    if (price) usd = balance * price.usd
  }
  return { asset, balance, balanceRaw, usd, network: NETWORKS[asset.chainId]?.name || String(asset.chainId) }
}

export function usePortfolio({ accountAddress } = {}) {
  const wallet = useWallet() || {}
  const { isConnected } = wallet
  // Spec 063 (US1): the portfolio follows the account the member is ACTING AS. When an acting
  // account (vault / recovered) is selected, its EVM address is scanned across chains instead of
  // the connected wallet's; personal mode passes no override, so behavior is byte-identical.
  // (A non-personal account has no passkey-issued Bitcoin addresses, so the Bitcoin source simply
  // contributes nothing for it — honest, no phantom BTC row.)
  const address = accountAddress ?? wallet.address
  const { preferences } = useUserPreferences() || {}
  const showTestnetAssets = Boolean(preferences?.showTestnetAssets)
  const showZeroBalances = Boolean(preferences?.showZeroBalances)

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

  // Non-EVM bitcoin scope (spec 061, FR-008/021): mainnet always, testnet only
  // with the same testnet preference that gates EVM testnets. String ids —
  // these NEVER enter the EVM balance-read loop or the provider map.
  const bitcoinNetworkIds = useMemo(
    () => (showTestnetAssets ? ['bitcoin', 'bitcoin-testnet'] : ['bitcoin']),
    [showTestnetAssets],
  )
  // Bitcoin asset descriptors join the PRICING registry only (so underlying
  // `BTC` resolves through the existing Chainlink feed path) — never the scan
  // registry: their chainId is a string network id, not an EVM chain.
  const bitcoinAssets = useMemo(
    () => bitcoinNetworkIds.map((id) => getBitcoinPortfolioAsset(id)).filter(Boolean),
    [bitcoinNetworkIds],
  )

  const [reads, setReads] = useState({ balances: null, failedAssets: [], error: null, bitcoinEntries: [] })
  const [priceMap, setPriceMap] = useState(() => new Map())
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
    setReads((prev) => (prev.error ? { balances: null, failedAssets: [], error: null, bitcoinEntries: [] } : prev))
    try {
      // Prices resolve concurrently with balances; a total pricing failure
      // leaves assets honestly unpriced without failing the portfolio.
      // The bitcoin source runs alongside (spec 061): a wallet with no issued
      // bitcoin addresses contributes nothing and makes no gateway calls, and
      // a total bitcoin failure degrades to failedAssets ['BTC'] — stale, not
      // zero (FR-010) — without touching the EVM path (SC-008).
      const [settled, priced, bitcoinRes] = await Promise.all([
        Promise.allSettled(
          registry.map((asset) =>
            readAssetBalance(asset, { provider: providers.get(asset.chainId), address }),
          ),
        ),
        fetchPortfolioPrices(providers, [...registry, ...bitcoinAssets]).catch(() => new Map()),
        loadBitcoinHoldings({
          account: address,
          networkIds: bitcoinNetworkIds,
          gateway: createBitcoinGatewayClient({ baseUrl: bitcoinGatewayUrl() }),
        }).catch(() => ({ holdings: [], failed: ['BTC'] })),
      ])
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
        // Nothing readable on any EVM network — an explicit error state,
        // never a $0 portfolio (unchanged pre-bitcoin semantics).
        setReads({ balances: null, failedAssets, error: 'Unable to read balances from the supported networks.', bitcoinEntries: [] })
      } else {
        setReads({
          balances,
          // Bitcoin failures ride the same honest-degradation channel the EVM
          // reads use: named in failedAssets, never rendered as zero.
          failedAssets: [...failedAssets, ...bitcoinRes.failed],
          error: null,
          bitcoinEntries: bitcoinRes.holdings,
        })
        setPriceMap(priced)
        setLastUpdated(Date.now())
      }
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      setReads({ balances: null, failedAssets: [], error: err?.message || 'Failed to load portfolio', bitcoinEntries: [] })
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false)
    }
  }, [isConnected, address, providers, registry, bitcoinAssets, bitcoinNetworkIds])

  // Reset synchronously on account or scan-scope change so a stale snapshot
  // (e.g. testnet rows after the preference flips off) can never render.
  useEffect(() => {
    reqIdRef.current++
    setReads({ balances: null, failedAssets: [], error: null, bitcoinEntries: [] })
    setPriceMap(new Map())
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

    // Every readable registry instance becomes a holding — zero balances
    // included, so aggregates can list all their instances in the sheet.
    // Zero-balance AGGREGATES are hidden from the main view unless the
    // member enables the zero-balance preference (FR-023).
    const holdings = []
    if (reads.balances) {
      for (const asset of registry) {
        const raw = reads.balances.get(`${asset.chainId}:${asset.id}`)
        if (raw == null) continue
        holdings.push(toHolding(asset, raw, priceMap))
      }
      // Native bitcoin holdings (spec 061) append AFTER the EVM scan so
      // aggregateHoldings rolls native BTC + WBTC into one Bitcoin row. Each
      // carries `holding.bitcoin` (pending/protected/spendable sats) for the
      // instance-level pending/protected disclosures (FR-009/FR-018).
      for (const entry of reads.bitcoinEntries || []) {
        holdings.push(toBitcoinHolding(entry, priceMap))
      }
    }

    const aggregates = aggregateHoldings(holdings, priceMap).filter(
      (agg) => showZeroBalances || agg.balance > 0,
    )

    const byCategory = new Map()
    for (const agg of aggregates) {
      const list = byCategory.get(agg.categoryId) || []
      list.push(agg)
      byCategory.set(agg.categoryId, list)
    }
    const categories = TAXONOMY_CATEGORIES
      // The regulatory categories always render; Unclassified only when it
      // actually holds something (FR-012).
      .filter((cat) => cat.id !== 'unclassified' || (byCategory.get(cat.id) || []).length > 0)
      .map((cat) => {
        const catAggregates = byCategory.get(cat.id) || []
        return {
          category: getTaxonomyCategory(cat.id),
          aggregates: catAggregates,
          subtotalUsd: catAggregates.reduce((sum, a) => sum + (a.usd ?? 0), 0),
        }
      })

    return {
      status,
      isLoading,
      error: reads.error,
      holdings,
      aggregates,
      categories,
      totalUsd: aggregates.reduce((sum, a) => sum + (a.usd ?? 0), 0),
      failedAssets: reads.failedAssets,
      priceMap,
      showTestnetAssets,
      showZeroBalances,
      lastUpdated,
      refresh: load,
    }
  }, [registry, isConnected, address, reads, priceMap, isLoading, lastUpdated, load, showTestnetAssets, showZeroBalances])
}

export default usePortfolio
