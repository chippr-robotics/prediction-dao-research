/**
 * WagerActivityContext — client-side wager watcher (spec 012).
 *
 * Polls the user's wagers via the v2 WagerRegistry read path
 * (fetchFriendMarketsForUser), diffs them against a persisted per-wager
 * snapshot, and exposes the activity feed, unread counts, and live
 * action-needed state. One diff path serves both catch-up (first poll vs the
 * snapshot persisted last session) and live detection (every 30 s while the
 * tab is visible).
 *
 * Honest-state guarantees (constitution III): nothing here fabricates state —
 * entries derive from chain reads; on poll failure the previous state is
 * retained and detection resumes on the next successful poll. All persisted
 * state is scoped per (account, chainId) and never mixed across scopes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WagerActivityContext, POLL_INTERVAL_MS } from './WagerActivityContext.js'
import { useWallet } from '../hooks/useWalletManagement'
import { useNotification } from '../hooks/useUI'
import { fetchFriendMarketsForUser } from '../utils/blockchainService'
import {
  defaultStore,
  loadStore,
  saveStore,
  appendEntries,
  markRead,
  pruneSnapshots,
} from '../data/notifications/activityStore'
import { diffWagers } from '../data/notifications/diffEngine'
import { deriveActionNeeded } from '../data/notifications/derivedState'
import { computeDeadlineWarnings } from '../data/notifications/deadlineWarnings'
import { scanDrawProposals } from '../data/notifications/drawProposalScan'

const MAX_TOASTS_PER_CYCLE = 3
const TOAST_DURATION_MS = 6000

export function WagerActivityProvider({
  children,
  fetchWagers = fetchFriendMarketsForUser,
  scanProposals = scanDrawProposals,
}) {
  const { account: rawAccount, chainId } = useWallet()
  const { showNotification } = useNotification()
  const account = rawAccount ? String(rawAccount).toLowerCase() : null

  const [store, setStore] = useState(defaultStore)
  const [actionNeededByWagerId, setActionNeededByWagerId] = useState({})
  const [isPolling, setIsPolling] = useState(false)
  const [lastPolledAt, setLastPolledAt] = useState(null)

  // Refs so the async poll never acts on a stale scope or store.
  const storeRef = useRef(store)
  const scopeRef = useRef(null)
  const pollingRef = useRef(false)
  const firstPollRef = useRef(true)
  const failureNoticedRef = useRef(false)

  const scopeKey = account && chainId ? `${account}|${chainId}` : null

  // Scope (account/chain) change: swap to that scope's persisted store
  // atomically — no carryover between accounts or networks.
  useEffect(() => {
    scopeRef.current = scopeKey
    firstPollRef.current = true
    pollingRef.current = false
    if (!scopeKey) {
      storeRef.current = defaultStore()
      setStore(storeRef.current)
      setActionNeededByWagerId({})
      setLastPolledAt(null)
      return
    }
    const loaded = loadStore(account, chainId)
    storeRef.current = loaded
    setStore(loaded)
    setActionNeededByWagerId({})
    setLastPolledAt(loaded.lastPolledAt || null)
  }, [scopeKey, account, chainId])

  const poll = useCallback(async () => {
    if (!account || !chainId || pollingRef.current) return
    const scope = `${account}|${chainId}`
    pollingRef.current = true
    setIsPolling(true)
    try {
      const wagers = (await fetchWagers(account, chainId)) || []
      if (scopeRef.current !== scope) return
      const nowMs = Date.now()
      const base = storeRef.current
      const ids = wagers.map(w => String(w.id))

      // Best-effort draw-proposal scan — pending consent is not readable from
      // chain state, only observable as events. Failure never blocks the
      // struct pipeline.
      let scan = { proposals: [], toBlock: base.drawScanBlock }
      try {
        scan = await scanProposals({ chainId, wagerIds: ids, fromBlock: base.drawScanBlock })
      } catch {
        scan = { proposals: [], toBlock: base.drawScanBlock }
      }
      if (scopeRef.current !== scope) return

      // Latest event per wager wins (scan results are chronological).
      const latestProposal = new Map()
      for (const p of scan.proposals || []) latestProposal.set(String(p.wagerId), p)
      const enriched = wagers.map(w => {
        const p = latestProposal.get(String(w.id))
        if (!p) return w
        return { ...w, drawProposedBy: p.revoked ? null : p.proposer }
      })

      const { entries: changeEntries, nextSnapshots } = diffWagers({
        snapshots: base.snapshots,
        wagers: enriched,
        account,
        nowMs,
      })
      const { entries: warnEntries, nextWarnRecords } = computeDeadlineWarnings({
        wagers: enriched,
        warnRecords: base.deadlineWarnings,
        account,
        nowMs,
      })
      const fresh = [...changeEntries, ...warnEntries]

      // Re-read the store AFTER all awaits: a markRead that landed while this
      // poll was in flight must survive the save. snapshots/deadlineWarnings/
      // drawScanBlock are poll-owned (polls never overlap), so the freshly
      // computed values are authoritative; entries and their read flags come
      // from the latest store.
      const latest = storeRef.current
      let next = {
        ...latest,
        snapshots: nextSnapshots,
        deadlineWarnings: nextWarnRecords,
        drawScanBlock: scan.toBlock ?? base.drawScanBlock,
        lastPolledAt: nowMs,
      }
      next = appendEntries(next, fresh)
      next = pruneSnapshots(next, ids, nowMs)
      saveStore(account, chainId, next)
      storeRef.current = next
      setStore(next)

      const actionMap = {}
      for (const w of enriched) {
        const id = String(w.id)
        actionMap[id] = deriveActionNeeded(
          w,
          account,
          nowMs,
          nextSnapshots[id]?.drawProposedBy ?? null
        )
      }
      setActionNeededByWagerId(actionMap)
      setLastPolledAt(nowMs)

      // Toast policy: live polls only — the catch-up batch stays feed-only so
      // a returning user is not toast-stormed.
      const isCatchUp = firstPollRef.current
      firstPollRef.current = false
      if (!isCatchUp && fresh.length > 0) {
        for (const entry of fresh.slice(0, MAX_TOASTS_PER_CYCLE)) {
          showNotification(entry.message, entry.severity, TOAST_DURATION_MS)
        }
        if (fresh.length > MAX_TOASTS_PER_CYCLE) {
          showNotification(
            `+${fresh.length - MAX_TOASTS_PER_CYCLE} more updates in activity`,
            'info',
            TOAST_DURATION_MS
          )
        }
      }
    } catch (err) {
      // Keep prior state — never fabricate. One notice per session, retry on
      // the next cycle.
      console.warn('[WagerActivity] poll failed:', err?.message || err)
      if (!failureNoticedRef.current) {
        failureNoticedRef.current = true
        showNotification("Couldn't refresh wager activity — will keep retrying", 'error', TOAST_DURATION_MS)
      }
    } finally {
      pollingRef.current = false
      setIsPolling(false)
    }
  }, [account, chainId, fetchWagers, scanProposals, showNotification])

  // Poll loop: deferred first poll (never blocks startup), 30 s cadence while
  // visible, paused when hidden, immediate poll when the tab returns.
  useEffect(() => {
    if (!scopeKey) return undefined
    let cancelled = false
    const tick = () => {
      if (!cancelled && document.visibilityState !== 'hidden') poll()
    }
    const startTimer = setTimeout(tick, 0)
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearTimeout(startTimer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [scopeKey, poll])

  const persist = useCallback(
    (next) => {
      storeRef.current = next
      setStore(next)
      if (account && chainId) saveStore(account, chainId, next)
    },
    [account, chainId]
  )

  const markEntryRead = useCallback(
    (entryId) => persist(markRead(storeRef.current, { entryId })),
    [persist]
  )
  const markWagerRead = useCallback(
    (wagerId) => persist(markRead(storeRef.current, { wagerId: String(wagerId) })),
    [persist]
  )
  const markAllRead = useCallback(() => persist(markRead(storeRef.current, '*')), [persist])

  const unreadCount = useMemo(
    () => store.entries.reduce((n, e) => n + (e.read ? 0 : 1), 0),
    [store.entries]
  )
  const actionNeededCount = useMemo(
    () => Object.values(actionNeededByWagerId).filter(Boolean).length,
    [actionNeededByWagerId]
  )

  const value = useMemo(
    () => ({
      entries: store.entries,
      unreadCount,
      isPolling,
      lastPolledAt,
      markEntryRead,
      markWagerRead,
      markAllRead,
      actionNeededByWagerId,
      actionNeededCount,
      refresh: poll,
    }),
    [
      store.entries,
      unreadCount,
      isPolling,
      lastPolledAt,
      markEntryRead,
      markWagerRead,
      markAllRead,
      actionNeededByWagerId,
      actionNeededCount,
      poll,
    ]
  )

  return <WagerActivityContext.Provider value={value}>{children}</WagerActivityContext.Provider>
}
