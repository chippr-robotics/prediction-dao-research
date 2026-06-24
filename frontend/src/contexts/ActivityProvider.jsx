/**
 * ActivityProvider — platform-wide activity watcher (spec 031). Generalizes the spec-012 wager watcher: it
 * runs every registered ActivitySource each cycle via the engine, merges their entries into one durable,
 * per-(account, chain) feed, and surfaces unread + action-needed + bounded live toasts.
 *
 * Honest-state guarantees (Constitution III): nothing is fabricated — entries derive from chain reads; a
 * source's failure retains its prior slice and prior action map (other sources proceed); on a cycle error the
 * previous state is kept and detection resumes next cycle. All persisted state is per (account, chainId) and
 * never mixed across scopes. The machinery (poll loop, scope swap + in-flight guard, concurrent-read-survives,
 * toast cap, catch-up feed-only) is ported verbatim from the wager watcher.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityContext, POLL_INTERVAL_MS } from './ActivityContext.js'
import { useWallet } from '../hooks/useWalletManagement'
import { useNotification } from '../hooks/useUI'
import { activitySources } from '../data/notifications/sources'
import { defaultStore, loadStore, saveStore, appendEntries, markRead, setSourceSlice } from '../data/notifications/activityStore'
import { detectAll, countActionNeeded } from '../data/notifications/activityEngine'

const MAX_TOASTS_PER_CYCLE = 3
const TOAST_DURATION_MS = 6000

export function ActivityProvider({ children, sources = activitySources }) {
  const { account: rawAccount, chainId } = useWallet()
  const { showNotification } = useNotification()
  const account = rawAccount ? String(rawAccount).toLowerCase() : null

  const [store, setStore] = useState(defaultStore)
  const [actionNeededByDomain, setActionNeededByDomain] = useState({})
  const [isPolling, setIsPolling] = useState(false)
  const [lastPolledAt, setLastPolledAt] = useState(null)

  // Refs so the async poll never acts on a stale scope or store.
  const storeRef = useRef(store)
  const actionRef = useRef({})
  const scopeRef = useRef(null)
  const pollingRef = useRef(false)
  const firstPollRef = useRef(true)
  const failureNoticedRef = useRef(false)

  const scopeKey = account && chainId ? `${account}|${chainId}` : null

  // Scope (account/chain) change: swap to that scope's persisted store atomically — no carryover.
  useEffect(() => {
    scopeRef.current = scopeKey
    firstPollRef.current = true
    pollingRef.current = false
    if (!scopeKey) {
      storeRef.current = defaultStore()
      setStore(storeRef.current)
      actionRef.current = {}
      setActionNeededByDomain({})
      setLastPolledAt(null)
      return
    }
    const loaded = loadStore(account, chainId)
    storeRef.current = loaded
    setStore(loaded)
    actionRef.current = {}
    setActionNeededByDomain({})
    setLastPolledAt(loaded.lastPolledAt || null)
  }, [scopeKey, account, chainId])

  const poll = useCallback(async () => {
    if (!account || !chainId || pollingRef.current) return
    const scope = `${account}|${chainId}`
    pollingRef.current = true
    setIsPolling(true)
    try {
      const nowMs = Date.now()
      const { sliceUpdates, fresh, actionNeededByDomain: nextAction, anyFailure } = await detectAll({
        sources,
        account,
        chainId,
        nowMs,
        priorStore: storeRef.current,
        prevActionByDomain: actionRef.current,
      })
      if (scopeRef.current !== scope) return // scope changed mid-flight — discard

      // Re-read the latest store AFTER awaits: a markRead that landed while this poll was in flight must
      // survive. Source slices are poll-owned (polls never overlap), so the freshly computed values win.
      const base = storeRef.current
      let next = base
      for (const [key, slice] of Object.entries(sliceUpdates)) next = setSourceSlice(next, key, slice)
      next = appendEntries(next, fresh)
      next = { ...next, lastPolledAt: nowMs }
      // Toast only the entries actually accepted by appendEntries (global id-dedup, existing wins) — not raw
      // `fresh` — so a deduped entry never re-toasts.
      const baseIds = new Set((base.entries || []).map((e) => e.id))
      const added = fresh.filter((e) => e && !baseIds.has(e.id))
      saveStore(account, chainId, next)
      storeRef.current = next
      setStore(next)
      actionRef.current = nextAction
      setActionNeededByDomain(nextAction)
      setLastPolledAt(nowMs)

      // Toast policy: live polls only — the catch-up batch (first poll vs last-session store) stays feed-only
      // so a returning user is not toast-stormed. Cap is applied ONCE over the merged cross-source list.
      const isCatchUp = firstPollRef.current
      firstPollRef.current = false
      if (!isCatchUp && added.length > 0) {
        for (const entry of added.slice(0, MAX_TOASTS_PER_CYCLE)) {
          showNotification(entry.message, entry.severity, TOAST_DURATION_MS)
        }
        if (added.length > MAX_TOASTS_PER_CYCLE) {
          showNotification(`+${added.length - MAX_TOASTS_PER_CYCLE} more updates in activity`, 'info', TOAST_DURATION_MS)
        }
      }
      if (anyFailure && !failureNoticedRef.current) {
        failureNoticedRef.current = true
        showNotification("Couldn't refresh some activity — will keep retrying", 'error', TOAST_DURATION_MS)
      }
    } catch (err) {
      console.warn('[ActivityProvider] poll failed:', err?.message || err)
      if (!failureNoticedRef.current) {
        failureNoticedRef.current = true
        showNotification("Couldn't refresh activity — will keep retrying", 'error', TOAST_DURATION_MS)
      }
    } finally {
      pollingRef.current = false
      setIsPolling(false)
    }
  }, [account, chainId, sources, showNotification])

  // Poll loop: deferred first poll (never blocks startup), 30s cadence while visible, paused when hidden,
  // immediate poll when the tab returns.
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

  const markEntryRead = useCallback((entryId) => persist(markRead(storeRef.current, { entryId })), [persist])
  const markRefRead = useCallback((refId) => persist(markRead(storeRef.current, { refId: String(refId) })), [persist])
  const markAllRead = useCallback(() => persist(markRead(storeRef.current, '*')), [persist])

  const unreadCount = useMemo(() => store.entries.reduce((n, e) => n + (e.read ? 0 : 1), 0), [store.entries])
  const actionNeededCount = useMemo(() => countActionNeeded(actionNeededByDomain), [actionNeededByDomain])

  const value = useMemo(
    () => ({
      entries: store.entries,
      unreadCount,
      actionNeededCount,
      actionNeededByDomain,
      isPolling,
      lastPolledAt,
      markEntryRead,
      markRefRead,
      markAllRead,
      refresh: poll,
    }),
    [store.entries, unreadCount, actionNeededCount, actionNeededByDomain, isPolling, lastPolledAt, markEntryRead, markRefRead, markAllRead, poll]
  )

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export default ActivityProvider
