/**
 * useWagerActivity (spec 012 → spec 031 shim).
 *
 * The wager watcher is now one source on the generalized ActivityProvider (spec 031). This hook is kept as a
 * stable, wager-scoped view over the new context so existing wager consumers (the activity feed, dashboard
 * quick-actions, wager tables/cards, my-markets modal) keep working unchanged — same return shape as before:
 * `{ entries, unreadCount, isPolling, lastPolledAt, markEntryRead, markWagerRead, markAllRead,
 *    actionNeededByWagerId, actionNeededCount, refresh }`.
 *
 * `entries`/`unreadCount`/`actionNeeded*` are scoped to the wager domain; read/refresh delegate to the
 * generalized provider.
 */
import { useMemo } from 'react'
import { useActivity, useActivityOptional } from './useActivity'

function toWagerView(ctx) {
  if (!ctx) return null
  const entries = (ctx.entries || []).filter((e) => (e.domain || 'wagers') === 'wagers')
  const actionNeededByWagerId = (ctx.actionNeededByDomain && ctx.actionNeededByDomain.wagers) || {}
  const actionNeededCount = Object.values(actionNeededByWagerId).filter(Boolean).length
  return {
    entries,
    unreadCount: entries.reduce((n, e) => n + (e.read ? 0 : 1), 0),
    isPolling: ctx.isPolling,
    lastPolledAt: ctx.lastPolledAt,
    markEntryRead: ctx.markEntryRead,
    markWagerRead: (wagerId) => ctx.markRefRead(String(wagerId)),
    markAllRead: ctx.markAllRead,
    actionNeededByWagerId,
    actionNeededCount,
    refresh: ctx.refresh,
  }
}

/** Throws outside an ActivityProvider (matches the prior provider-required contract). */
export function useWagerActivity() {
  const ctx = useActivity()
  return useMemo(() => toWagerView(ctx), [ctx])
}

/** Null-safe variant for components that also render outside the provider (header bell, wager rows). */
export function useWagerActivityOptional() {
  const ctx = useActivityOptional()
  return useMemo(() => toWagerView(ctx), [ctx])
}

export default useWagerActivity
