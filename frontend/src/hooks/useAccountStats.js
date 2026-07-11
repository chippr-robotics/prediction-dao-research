/**
 * useAccountStats — the Account dashboard's single data seam (spec 020,
 * re-pointed at the unified activity ledger by spec 051).
 *
 * Composes existing feeds into the derived view models in data-model.md:
 *  - member wagers (WagerRepository.listMyWagers, all pages)
 *  - the unified activity ledger (spec 051) — ALL activity classes; the
 *    wager-class entries feed the P&L/summary/breakdown math via
 *    lib/account/ledgerAdapters so dashboard figures and the tax report read
 *    the same ledger and can never disagree (FR-014/015)
 *  - wallet balances + native→USD (wallet context + usePriceConversion)
 *
 * Pure aggregation lives in lib/account/*; this hook only wires feeds, manages
 * the range selection (local recompute, no refetch), per-section freshness, and
 * honest empty/error states. Everything is keyed on the active chainId.
 *
 * Updates are polling-based — no websockets. See research.md R5.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import usePriceConversion from './usePriceConversion'
import { useChainTokens } from './useChainTokens'
import { getDefaultWagerRepository } from '../data/wagers/WagerRepository'
import { getDefaultLedgerRepository } from '../data/ledger'
import { getContractAddressForChain } from '../config/contracts'
import {
  computeSummary,
  computePnlSeries,
  computeBreakdowns,
  isSettledStatus,
  DEFAULT_RANGE,
} from '../lib/account'
import { wagerTransfersFromLedger, tokenMetaFromLedger } from '../lib/account/ledgerAdapters'

const POLL_MS = 60_000

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)']

function emptyFreshness() {
  return { lastUpdated: null, status: 'refreshing' }
}

/**
 * Read the connected wallet's stablecoin balance in human units. The wallet
 * context only tracks the native balance, so the dashboard's "Wallet Balance"
 * tile would otherwise omit the user's USDC — the very token wagers are staked
 * in. Best-effort: a read failure returns null and leaves the tile unchanged.
 */
async function fetchStableBalance({ provider, address, stableAddress, stableDecimals }) {
  if (!provider || !address || !stableAddress) return null
  try {
    const token = new Contract(stableAddress, ERC20_BALANCE_ABI, provider)
    const raw = await token.balanceOf(address)
    return Number(formatUnits(raw, stableDecimals ?? 6))
  } catch {
    return null
  }
}

async function loadAllWagers(repository, account) {
  const all = []
  let cursor = null
  for (let page = 0; page < 200; page++) {
    const res = await repository.listMyWagers({
      userAddress: account,
      cursor,
      pageSize: 100,
      filter: { includeExpired: true },
    })
    all.push(...(res.items || []))
    if (!res.hasMore || !res.nextCursor) break
    cursor = res.nextCursor
  }
  return all
}

export function useAccountStats({ range: initialRange = DEFAULT_RANGE } = {}) {
  const wallet = useWallet() || {}
  const { address, chainId, isConnected, balances, refreshBalances, provider } = wallet
  const { convertToUsd } = usePriceConversion()
  const tokens = useChainTokens()

  const [range, setRange] = useState(initialRange)
  const [wagers, setWagers] = useState([])
  const [stableBalance, setStableBalance] = useState(null)
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [staleClasses, setStaleClasses] = useState([])
  const [prunedBefore, setPrunedBefore] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSupportedNetwork, setIsSupportedNetwork] = useState(true)
  const [freshness, setFreshness] = useState({
    summary: emptyFreshness(),
    series: emptyFreshness(),
    balances: emptyFreshness(),
    activity: emptyFreshness(),
  })

  const reqIdRef = useRef(0)

  const ledgerRepository = useMemo(() => getDefaultLedgerRepository(), [])

  const load = useCallback(async () => {
    if (!isConnected || !address) {
      setWagers([])
      setLedgerEntries([])
      setStaleClasses([])
      setStableBalance(null)
      setIsLoading(false)
      return
    }
    // Network support is decided by a configured escrow for the active chain —
    // the same resolution the wager list and report use. Without one, the
    // dashboard's data is meaningless, so surface the "unsupported" state rather
    // than spinning forever.
    const escrowConfigured = Boolean(
      getContractAddressForChain('wagerRegistry', chainId) ||
      getContractAddressForChain('friendGroupMarketFactory', chainId),
    )
    if (!escrowConfigured) {
      setIsSupportedNetwork(false)
      setWagers([])
      setLedgerEntries([])
      setStaleClasses([])
      setIsLoading(false)
      const settled = { lastUpdated: Date.now(), status: 'fresh' }
      setFreshness({ summary: settled, series: settled, balances: settled, activity: settled })
      return
    }

    const reqId = ++reqIdRef.current
    setIsLoading(true)
    setError(null)
    setFreshness((f) => ({
      summary: { ...f.summary, status: 'refreshing' },
      series: { ...f.series, status: 'refreshing' },
      balances: { ...f.balances, status: 'refreshing' },
      activity: { ...f.activity, status: 'refreshing' },
    }))
    try {
      const repository = getDefaultWagerRepository(chainId)
      const [loadedWagers, stable, ledger] = await Promise.all([
        loadAllWagers(repository, address),
        fetchStableBalance({
          provider,
          address,
          stableAddress: tokens.stableAddress,
          stableDecimals: tokens.stableDecimals,
        }),
        // The unified activity ledger (spec 051): all classes, one read path
        // shared with the tax report so the two can never disagree.
        ledgerRepository.listEntries({ account: address, chainId, provider }),
      ])
      if (reqId !== reqIdRef.current) return

      setWagers(loadedWagers)
      if (stable != null) setStableBalance(stable)
      setLedgerEntries(ledger.entries)
      setStaleClasses(ledger.staleClasses)
      setPrunedBefore(ledger.prunedBefore)
      setIsSupportedNetwork(true)
      const now = Date.now()
      const fresh = { lastUpdated: now, status: 'fresh' }
      setFreshness({ summary: fresh, series: fresh, balances: fresh, activity: fresh })
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      const msg = err?.message || 'Failed to load account stats'
      if (/escrow|subgraph|configured for this network/i.test(msg)) {
        setIsSupportedNetwork(false)
      }
      setError(msg)
      // keep last-known values; mark sections stale rather than blanking
      setFreshness((f) => ({
        summary: { ...f.summary, status: 'stale' },
        series: { ...f.series, status: 'stale' },
        balances: { ...f.balances, status: 'stale' },
        activity: { ...f.activity, status: 'stale' },
      }))
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false)
    }
  }, [isConnected, address, chainId, provider, tokens.stableAddress, tokens.stableDecimals, ledgerRepository])

  // Reload on connect / account / network change.
  useEffect(() => {
    load()
  }, [load])

  // Polling.
  useEffect(() => {
    if (!isConnected || !address) return undefined
    const id = setInterval(() => load(), POLL_MS)
    return () => clearInterval(id)
  }, [isConnected, address, load])

  const refresh = useCallback(async () => {
    try {
      await refreshBalances?.()
    } catch {
      /* balance refresh is best-effort */
    }
    await load()
  }, [refreshBalances, load])

  // ---- Wallet balance (USD) ----
  const { walletBalanceUsd, walletBalances } = useMemo(() => {
    const rows = []
    let usd = 0
    const nativeAmt = Number(balances?.native) || 0
    if (nativeAmt > 0 || tokens.native) {
      const nUsd = Number(convertToUsd(nativeAmt)) || 0
      usd += nUsd
      rows.push({ symbol: tokens.native || 'NATIVE', amount: nativeAmt, usdValue: nUsd })
    }
    // Stablecoin balance (par $1) read directly from the token contract — the
    // wallet context only tracks native, so this is the wager-staking balance.
    const stableAmt = Number(stableBalance) || 0
    if (stableAmt > 0) {
      usd += stableAmt
      rows.push({ symbol: tokens.stable || 'STABLE', amount: stableAmt, usdValue: stableAmt })
    }
    return { walletBalanceUsd: usd, walletBalances: rows }
  }, [balances, convertToUsd, stableBalance, tokens.native, tokens.stable])

  // ---- Derived view models ----
  const wagerStatusById = useMemo(() => {
    const m = new Map()
    for (const w of wagers) m.set(String(w.id), w.status)
    return m
  }, [wagers])

  // Wager money flows come from the ledger (single read path, FR-015); failed
  // entries are excluded by the adapter so they never touch a total (FR-003).
  const valuedTransfers = useMemo(() => wagerTransfersFromLedger(ledgerEntries), [ledgerEntries])
  const tokenMetaByAddress = useMemo(() => tokenMetaFromLedger(ledgerEntries), [ledgerEntries])

  const summary = useMemo(
    () => computeSummary({ wagers, transfers: valuedTransfers, address, walletBalanceUsd, walletBalances }),
    [wagers, valuedTransfers, address, walletBalanceUsd, walletBalances],
  )

  const settledTransfers = useMemo(
    () => valuedTransfers.filter((t) => isSettledStatus(wagerStatusById.get(String(t.wagerId)))),
    [valuedTransfers, wagerStatusById],
  )

  const series = useMemo(
    () => computePnlSeries(settledTransfers, range, Date.now()),
    [settledTransfers, range],
  )

  const breakdowns = useMemo(
    () => computeBreakdowns({ wagers, transfers: valuedTransfers, tokenMetaByAddress }),
    [wagers, valuedTransfers, tokenMetaByAddress],
  )

  // The Account tab's canonical activity record: ALL classes, newest first,
  // failed entries included and labeled (they are excluded from totals above).
  const activity = useMemo(() => ledgerEntries.slice(0, 50), [ledgerEntries])

  const isEmpty = isConnected && !isLoading && wagers.length === 0 && ledgerEntries.length === 0

  return {
    summary,
    series,
    setRange,
    breakdowns,
    activity,
    staleClasses,
    prunedBefore,
    isConnected: Boolean(isConnected),
    isSupportedNetwork,
    chainId,
    isLoading,
    isEmpty,
    error,
    freshness,
    refresh,
  }
}

export default useAccountStats
