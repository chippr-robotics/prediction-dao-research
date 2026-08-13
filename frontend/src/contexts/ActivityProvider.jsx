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
 *
 * Failure disclosure is deliberately slower and more specific than it used to be. It waits for
 * FAILURE_NOTICE_AFTER_CYCLES consecutive failing cycles (so a cold start on the first cycle is not
 * announced as a broken app), it NAMES the domains that could not be read, and it clears itself on a
 * clean cycle. A source that is merely still backfilling history reports `partial`, not `ok:false`,
 * and so reaches none of this — "still reading" is not "could not read".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityContext, POLL_INTERVAL_MS } from './ActivityContext.js'
import { useWallet } from '../hooks/useWalletManagement'
import { useNotification } from '../hooks/useUI'
import { activitySources } from '../data/notifications/sources'
import { defaultStore, loadStore, saveStore, appendEntries, markRead, setSourceSlice } from '../data/notifications/activityStore'
import { detectAll, countActionNeeded } from '../data/notifications/activityEngine'
import { resolveEntryDelivery } from '../lib/notifications/notificationProfiles'
import { showSystemNotification } from '../lib/notifications/pushDelivery'

const MAX_TOASTS_PER_CYCLE = 3
const TOAST_DURATION_MS = 6000

/**
 * Consecutive failed cycles before the member is told anything.
 *
 * The first cycle runs at mount, while the wallet, the RPC route and (on a cold gateway) a Cloud Run
 * container are all still coming up — so a single blip there used to paint a red error banner across
 * a perfectly working app before it had finished loading, which reads as "this thing is broken".
 * Entries already get this courtesy: the catch-up cycle is feed-only so a returning member is not
 * toast-stormed. Failures get the same one. A read that is genuinely down is still disclosed ~30s
 * later, and a transient one costs a silent retry instead of a false alarm.
 */
const FAILURE_NOTICE_AFTER_CYCLES = 2

/**
 * Name what is stale. "Some activity" told a member nothing they could act on and told us nothing we
 * could debug — a bug report against it could not even say which domain had failed.
 */
function failureNotice(failed) {
  const labels = failed.map((f) => f.label).filter(Boolean)
  if (labels.length === 0) return "Couldn't refresh some activity — will keep retrying"
  if (labels.length === 1) return `Couldn't refresh ${labels[0]} activity — will keep retrying`
  if (labels.length === 2) return `Couldn't refresh ${labels[0]} and ${labels[1]} activity — will keep retrying`
  return `Couldn't refresh ${labels[0]}, ${labels[1]} and ${labels.length - 2} more — will keep retrying`
}

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
  // Consecutive failing cycles. Reset by any clean cycle, so the notice tracks reality in BOTH
  // directions: it can fire again after a recovery instead of latching for the whole session.
  const failureStreakRef = useRef(0)

  const scopeKey = account && chainId ? `${account}|${chainId}` : null

  // Scope (account/chain) change: swap to that scope's persisted store atomically — no carryover.
  useEffect(() => {
    scopeRef.current = scopeKey
    firstPollRef.current = true
    pollingRef.current = false
    failureStreakRef.current = 0
    failureNoticedRef.current = false
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
      const { sliceUpdates, fresh, actionNeededByDomain: nextAction, anyFailure, failed } = await detectAll({
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
        // Route each fresh entry through the profile-aware gate (spec 059):
        // an active notification profile silences non-allowed domains (with
        // action-required/deadline exceptions breaking through); otherwise the
        // per-device domain mode applies as before. 'silent' → feed only
        // (already persisted above); 'app' → in-app toast; 'push' → in-app
        // toast + a system notification on this device. The toast cap applies
        // to non-silent entries; system notifications are capped the same way
        // so a busy cycle can't spam.
        const toastable = added.filter((e) => resolveEntryDelivery(e) !== 'silent')
        for (const entry of toastable.slice(0, MAX_TOASTS_PER_CYCLE)) {
          showNotification(entry.message, entry.severity, TOAST_DURATION_MS)
        }
        if (toastable.length > MAX_TOASTS_PER_CYCLE) {
          showNotification(`+${toastable.length - MAX_TOASTS_PER_CYCLE} more updates in activity`, 'info', TOAST_DURATION_MS)
        }
        const pushable = added.filter((e) => resolveEntryDelivery(e) === 'push')
        for (const entry of pushable.slice(0, MAX_TOASTS_PER_CYCLE)) {
          showSystemNotification(entry)
        }
      }
      if (anyFailure) {
        failureStreakRef.current += 1
        if (failureStreakRef.current >= FAILURE_NOTICE_AFTER_CYCLES && !failureNoticedRef.current) {
          failureNoticedRef.current = true
          showNotification(failureNotice(failed || []), 'error', TOAST_DURATION_MS)
        }
      } else {
        // Everything read. Forget the streak AND the fact we had complained, so a later outage is
        // disclosed on its own merits rather than being swallowed as already-mentioned.
        failureStreakRef.current = 0
        failureNoticedRef.current = false
      }
    } catch (err) {
      console.warn('[ActivityProvider] poll failed:', err?.message || err)
      failureStreakRef.current += 1
      if (failureStreakRef.current >= FAILURE_NOTICE_AFTER_CYCLES && !failureNoticedRef.current) {
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
