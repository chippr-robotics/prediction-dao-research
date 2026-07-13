/**
 * useTagRegistryMetrics (spec 054 — operator admin) — derives registry-wide metrics for the operator
 * dashboard from a bounded, resilient client-side event scan. The WagerTagRegistry exposes only
 * point-lookup views (no counters / enumeration) and the subgraph does not index it, so — under the
 * no-backend footprint — event-log scanning is the only aggregate source (mirrors DenyListAdmin).
 *
 * The scan is bounded (a MAX_SPAN backward lookback, never from genesis — public RPCs reject wide
 * eth_getLogs), chunked, and degrades on provider range-caps via `getLogsRange` (bisect-on-reject).
 * Results are cached per (chain, address) with a short TTL so remounts don't re-scan. Triggered
 * explicitly (a Refresh button), never auto-polled. When the lookback is capped, `truncated` is true
 * and lifetime tallies are honestly "within the scanned window", not all-time.
 */
import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { WAGER_TAG_REGISTRY_ABI, TagStatus } from '../abis/wagerTagRegistry'
import { getLogsRange } from '../components/clearpath/connectors/ozGovernor'

const CHUNK = 45_000
const MAX_SPAN = 3_000_000
const CACHE_TTL_MS = 60_000
const RECENT_LIMIT = 50

const cacheByKey = new Map() // `${chainId}:${address}` -> { at, data }

/**
 * Pure reducer: fold parsed registry events into operator metrics. Exported for unit testing.
 * @param {Array<{name:string,args:object,blockNumber:number,logIndex:number}>} events parsed log events
 * @param {boolean} truncated whether the scan window was capped (older history not loaded)
 */
export function reduceTagMetrics(events, truncated = false) {
  // Replay moderation state in chain order (last-write-wins per tagHash).
  const ordered = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
  )
  const counts = {
    registered: 0,
    changed: 0,
    released: 0,
    reclaimed: 0,
    repointRequested: 0,
    repointFinalized: 0,
    repointCancelled: 0,
    committed: 0,
  }
  const suspended = new Set()
  const verified = new Set()
  const reserved = new Set()
  const hashToTag = new Map()

  for (const ev of ordered) {
    switch (ev.name) {
      case 'TagRegistered':
        counts.registered++
        if (ev.args.tag) hashToTag.set(ev.args.tagHash, ev.args.tag)
        break
      case 'TagChanged':
        counts.changed++
        break
      case 'TagReleased':
        counts.released++
        break
      case 'TagReclaimed':
        counts.reclaimed++
        break
      case 'TagRepointRequested':
        counts.repointRequested++
        break
      case 'TagRepointFinalized':
        counts.repointFinalized++
        break
      case 'TagRepointCancelled':
        counts.repointCancelled++
        break
      case 'TagCommitted':
        counts.committed++
        break
      case 'TagSuspended':
        if (ev.args.suspended) suspended.add(ev.args.tagHash)
        else suspended.delete(ev.args.tagHash)
        break
      case 'TagVerificationSet':
        if (ev.args.verified) verified.add(ev.args.tagHash)
        else verified.delete(ev.args.tagHash)
        break
      case 'TagReserved':
        if (ev.args.reserved) reserved.add(ev.args.tagHash)
        else reserved.delete(ev.args.tagHash)
        break
      default:
        break
    }
  }

  // Net change to the active set within the window. TagChanged and repoints are count-neutral
  // (change: -1 old +1 new; repoint: owner moves, count unchanged), so net = registered − released
  // − reclaimed. When the window is not truncated (floor == 0) this equals the live active total.
  const netRegistrations = counts.registered - counts.released - counts.reclaimed

  const label = (h) => hashToTag.get(h) || null
  const recent = [...ordered]
    .reverse()
    .slice(0, RECENT_LIMIT)
    .map((ev) => ({
      type: ev.name,
      tagHash: ev.args.tagHash || ev.args.newTagHash || null,
      tag: label(ev.args.tagHash || ev.args.newTagHash),
      owner: ev.args.owner || ev.args.to || ev.args.from || null,
      block: ev.blockNumber,
    }))

  return {
    counts,
    netRegistrations,
    suspended: [...suspended].map((h) => ({ tagHash: h, tag: label(h) })),
    verified: [...verified].map((h) => ({ tagHash: h, tag: label(h) })),
    reserved: [...reserved].map((h) => ({ tagHash: h, tag: label(h) })),
    recent,
    truncated,
    totalEvents: events.length,
  }
}

/**
 * @param {{ provider: any, chainId: number, address: string }} args
 * @returns {{ loading, error, data, truncated, refresh }}
 */
export function useTagRegistryMetrics({ provider, chainId, address } = {}) {
  const [state, setState] = useState({ loading: false, error: null, data: null, truncated: false })

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      if (!provider || !address || !ethers.isAddress(address)) {
        setState({ loading: false, error: null, data: null, truncated: false })
        return
      }
      const key = `${chainId}:${address.toLowerCase()}`
      const cached = cacheByKey.get(key)
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setState({ loading: false, error: null, data: cached.data, truncated: cached.data.truncated })
        return
      }
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const iface = new ethers.Interface(WAGER_TAG_REGISTRY_ABI)
        const latest = await provider.getBlockNumber()
        const floor = Math.max(0, latest - MAX_SPAN)
        const rawLogs = []
        let to = latest
        while (to >= floor) {
          const from = Math.max(floor, to - CHUNK + 1)
          // No topic filter → all registry events in the range; getLogsRange bisects on RPC range-caps.
          const batch = await getLogsRange(provider, address, from, to, 2000, [])
          rawLogs.push(...batch)
          if (from === floor) break
          to = from - 1
        }
        const parsed = []
        for (const log of rawLogs) {
          try {
            const p = iface.parseLog({ topics: log.topics, data: log.data })
            if (p) parsed.push({ name: p.name, args: p.args, blockNumber: log.blockNumber, logIndex: log.index ?? log.logIndex })
          } catch {
            /* not one of our events — skip */
          }
        }
        const data = reduceTagMetrics(parsed, floor > 0)
        cacheByKey.set(key, { at: Date.now(), data })
        setState({ loading: false, error: null, data, truncated: data.truncated })
      } catch (err) {
        setState({ loading: false, error: err?.message || String(err), data: null, truncated: false })
      }
    },
    [provider, chainId, address],
  )

  return { ...state, refresh }
}

// Re-export for consumers building status chips.
export { TagStatus }
export default useTagRegistryMetrics
