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
 * honest empty/error states.
 *
 * Spec 092: HISTORY reads span the build's cohort — wagers and the ledger are
 * read per cohort chain (estate pattern, per-chain isolation) and merged, so
 * the record no longer changes when the wallet switches networks. Unreachable
 * chains surface as named `partialChains`; the wallet-balance tile keeps its
 * active-chain read (it describes the connected wallet, not history).
 *
 * Updates are polling-based — no websockets. See research.md R5.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import usePriceConversion from './usePriceConversion'
import { useChainTokens } from './useChainTokens'
import { getDefaultWagerRepository } from '../data/wagers/WagerRepository'
import { getDefaultEstateLedger } from '../data/ledger'
import { getContractAddressForChain } from '../config/contracts'
import { cohortChainIds } from '../config/networks'
import { networkName } from '../lib/chains/estate'
import {
  computeSummary,
  computePnlSeries,
  computeBreakdowns,
  isSettledStatus,
  DEFAULT_RANGE,
} from '../lib/account'
import {
  wagerTransfersFromLedger,
  tokenMetaFromLedger,
  wagerTitlesByChain,
  annotateWagerEntries,
} from '../lib/account/ledgerAdapters'

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

/**
 * Wager records across the cohort (spec 092), with the estate pattern's
 * isolation: a chain with no configured escrow is not-deployed — genuinely no
 * wagers, no warning (FR-005); a chain whose read throws is unreachable and
 * joins the partial set; every returned record is tagged with its chainId so
 * id-keyed lookups downstream never cross chains (FR-007).
 * Never rejects.
 */
async function loadWagersAcrossEstate(account, { chainIds, wagerRepositoryFor }) {
  const results = await Promise.all(
    chainIds.map(async (cid) => {
      const escrowConfigured = Boolean(
        getContractAddressForChain('wagerRegistry', cid) ||
        getContractAddressForChain('friendGroupMarketFactory', cid),
      )
      if (!escrowConfigured) return { chainId: cid, state: 'not-deployed', wagers: [] }
      try {
        const loaded = await loadAllWagers(wagerRepositoryFor(cid), account)
        return { chainId: cid, state: 'read', wagers: loaded.map((w) => ({ ...w, chainId: cid })) }
      } catch {
        return { chainId: cid, state: 'unreachable', wagers: [] }
      }
    }),
  )
  return {
    wagers: results.flatMap((r) => r.wagers),
    unreachableChains: results.filter((r) => r.state === 'unreachable').map((r) => r.chainId),
  }
}

export function useAccountStats({ range: initialRange = DEFAULT_RANGE, accountAddress = null } = {}) {
  const wallet = useWallet() || {}
  const { address: connectedAddress, chainId, isConnected, balances, refreshBalances, provider } = wallet
  // Spec 063 pattern (mirrors usePortfolio): the stats follow the account the
  // member is ACTING AS when the caller passes one — a multisig vault or a
  // recovered legacy account — and default to the connected wallet otherwise.
  const address = accountAddress || connectedAddress
  const isActingOverride = Boolean(
    accountAddress &&
    connectedAddress &&
    String(accountAddress).toLowerCase() !== String(connectedAddress).toLowerCase(),
  )
  const { convertToUsd } = usePriceConversion()
  const tokens = useChainTokens()

  const [range, setRange] = useState(initialRange)
  const [wagers, setWagers] = useState([])
  const [stableBalance, setStableBalance] = useState(null)
  // Native balance of the ACTING account. The wallet context only tracks the
  // connected wallet's native balance, so an acting override reads its own.
  const [actingNativeBalance, setActingNativeBalance] = useState(null)
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [staleClasses, setStaleClasses] = useState([])
  const [prunedByChain, setPrunedByChain] = useState([])
  const [networkStates, setNetworkStates] = useState([])
  const [partialChains, setPartialChains] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [freshness, setFreshness] = useState({
    summary: emptyFreshness(),
    series: emptyFreshness(),
    balances: emptyFreshness(),
    activity: emptyFreshness(),
  })

  const reqIdRef = useRef(0)

  const estateLedger = useMemo(() => getDefaultEstateLedger(), [])

  const load = useCallback(async () => {
    if (!isConnected || !address) {
      setWagers([])
      setLedgerEntries([])
      setStaleClasses([])
      setNetworkStates([])
      setPartialChains([])
      setStableBalance(null)
      setActingNativeBalance(null)
      setIsLoading(false)
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
      // Spec 092: history reads span the COHORT, independent of the active
      // network. Neither estate read ever rejects — failures come back as
      // per-chain unreachable states, disclosed instead of thrown.
      const cohort = cohortChainIds()
      const [wagerEstate, stable, ledger, actingNative] = await Promise.all([
        loadWagersAcrossEstate(address, {
          chainIds: cohort,
          wagerRepositoryFor: getDefaultWagerRepository,
        }),
        fetchStableBalance({
          provider,
          address,
          stableAddress: tokens.stableAddress,
          stableDecimals: tokens.stableDecimals,
        }),
        // The unified activity ledger (spec 051), merged across the cohort
        // (spec 092) — one read path shared with the tax report per chain.
        estateLedger.listEntriesAcrossEstate({
          account: address,
          walletChainId: chainId,
          walletProvider: provider,
        }),
        // Acting override only: the wallet context tracks the CONNECTED wallet's
        // native balance, so the acting account's is read directly. Best-effort —
        // null leaves the tile on the last-known value rather than faking a zero.
        isActingOverride && provider
          ? provider.getBalance(address).then((raw) => Number(formatUnits(raw, 18))).catch(() => null)
          : Promise.resolve(null),
      ])
      if (reqId !== reqIdRef.current) return

      if (stable != null) setStableBalance(stable)
      if (actingNative != null) setActingNativeBalance(actingNative)

      // Partial = the union of chains the ledger could not read and chains the
      // wager repositories could not read; disclosure uses display names.
      const partialIds = [...new Set([...ledger.partialChains, ...wagerEstate.unreachableChains])]
      const allUnreachable =
        cohort.length > 0 && ledger.chainStates.every((s) => s.state === 'unreachable')

      if (allUnreachable) {
        // FR-009: every cohort chain failed — keep last-known values, mark
        // stale, and surface an explicit error. Never blank into "no activity".
        setError('None of your networks could be read right now.')
        setNetworkStates(ledger.chainStates)
        setPartialChains(partialIds.map((id) => networkName(id)))
        setFreshness((f) => ({
          summary: { ...f.summary, status: 'stale' },
          series: { ...f.series, status: 'stale' },
          balances: { ...f.balances, status: 'stale' },
          activity: { ...f.activity, status: 'stale' },
        }))
        return
      }

      setWagers(wagerEstate.wagers)
      setLedgerEntries(ledger.entries)
      // Per-class staleness now names its network: "earn on Polygon".
      setStaleClasses(
        [...ledger.staleByChain.entries()].flatMap(([cid, classes]) =>
          classes.map((c) => `${c} on ${networkName(cid)}`),
        ),
      )
      setPrunedByChain(
        [...ledger.prunedByChain.entries()].map(([cid, before]) => ({
          chainId: cid,
          network: networkName(cid),
          before,
        })),
      )
      setNetworkStates(ledger.chainStates)
      setPartialChains(partialIds.map((id) => networkName(id)))
      const now = Date.now()
      const fresh = { lastUpdated: now, status: 'fresh' }
      setFreshness({ summary: fresh, series: fresh, balances: fresh, activity: fresh })
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      setError(err?.message || 'Failed to load account stats')
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
  }, [isConnected, address, isActingOverride, chainId, provider, tokens.stableAddress, tokens.stableDecimals, estateLedger])

  // Reload on connect / account / network change. Switching accounts (including
  // switching the ACTING account) must never show the previous account's
  // balances while the new ones load — clear them first.
  useEffect(() => {
    setStableBalance(null)
    setActingNativeBalance(null)
  }, [address])

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
    // Acting override: the context's native balance belongs to the CONNECTED
    // wallet, so the acting account's directly-read balance replaces it.
    const nativeAmt = isActingOverride
      ? Number(actingNativeBalance) || 0
      : Number(balances?.native) || 0
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
  }, [balances, convertToUsd, stableBalance, actingNativeBalance, isActingOverride, tokens.native, tokens.stable])

  // ---- Derived view models ----
  // Keyed by chain AND id (spec 092 FR-007): wager #12 on Polygon and wager
  // #12 on Mordor are different wagers; a flat id map would let one chain's
  // status shadow the other's.
  const wagerStatusByKey = useMemo(() => {
    const m = new Map()
    for (const w of wagers) m.set(`${Number(w.chainId)}:${String(w.id)}`, w.status)
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
    () =>
      valuedTransfers.filter((t) =>
        isSettledStatus(wagerStatusByKey.get(`${Number(t.chainId)}:${String(t.wagerId)}`)),
      ),
    [valuedTransfers, wagerStatusByKey],
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
  // Wager entries carry the wager's message (its My Wagers display title) so
  // the feed can say WHICH wager a deposit/payout/refund belongs to.
  // Titles are per-chain (spec 092): an entry only ever resolves against its
  // own chain's wager records. The 50-row cap applies AFTER the merged sort so
  // one busy chain cannot evict another's recent entries (R3).
  const wagerTitles = useMemo(() => wagerTitlesByChain(wagers), [wagers])
  const activity = useMemo(
    () => annotateWagerEntries(ledgerEntries.slice(0, 50), wagerTitles),
    [ledgerEntries, wagerTitles],
  )

  const isEmpty = isConnected && !isLoading && wagers.length === 0 && ledgerEntries.length === 0

  return {
    summary,
    series,
    setRange,
    breakdowns,
    activity,
    staleClasses,
    prunedByChain,
    networkStates,
    partialChains,
    isConnected: Boolean(isConnected),
    chainId,
    isLoading,
    isEmpty,
    error,
    freshness,
    refresh,
  }
}

export default useAccountStats
