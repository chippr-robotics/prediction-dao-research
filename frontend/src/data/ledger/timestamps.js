/**
 * Chain-time hydration for subgraph-less networks (spec 051 US4, FR-005).
 *
 * RegistrySource returns `createdAt: 0` because WagerRegistry stores no
 * creation time on-chain. This module recovers REAL block times by reusing
 * the report data source's bounded per-wager event scan (adaptive chunking +
 * request budget — never a genesis scan), then reading the matched events'
 * block timestamps. Results are cached in localStorage keyed by
 * (chainId, wagerId): the cache is pure performance — wager event times are
 * immutable chain facts, and losing the cache only costs a re-scan (FR-009).
 *
 * Honesty rule: when the budget is exhausted or the scan fails, timestamps
 * are left untouched (falsy) so downstream mapping renders the explicit
 * "date unavailable" state — a real time or none, never a fabricated one
 * (FR-006).
 */
import { createReportDataSource } from '../reports/reportDataSource'

const CACHE_KEY_PREFIX = 'fw_ledger_ts_cache_v1_'
// Per-call cap on newly-scanned wagers: each scan costs several RPC reads, so
// a large backlog hydrates progressively across polls instead of bursting.
const DEFAULT_MAX_WAGERS_PER_CALL = 8

const CREATION_EVENTS = new Set(['WagerCreated', 'MarketCreatedPending'])
const SETTLEMENT_EVENTS = new Set([
  'PayoutClaimed',
  'WagerRefunded',
  'WagerCancelled',
  'WagerDrawn',
  'WinningsClaimed',
  'StakeRefunded',
])

function readCache(chainId) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${chainId}`)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(chainId, cache) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${chainId}`, JSON.stringify(cache))
  } catch {
    // cache is best-effort
  }
}

/** Test seam: drop every chain's timestamp cache. */
export function __clearTimestampCache() {
  if (typeof localStorage === 'undefined') return
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(CACHE_KEY_PREFIX)) doomed.push(key)
  }
  doomed.forEach((k) => localStorage.removeItem(k))
}

/**
 * Fill missing createdAt/resolvedAt (epoch ms) on wager records from chain
 * truth, bounded per call. Returns new records; inputs are not mutated.
 *
 * @param {Array} wagers - RegistrySource-shaped records (createdAt may be 0)
 * @param {number} chainId
 * @param {object} [deps] - injectable for tests
 * @param {(wagerId:string)=>Promise<Array>} [deps.getWagerEvents]
 * @param {(blockNumber:number)=>Promise<{timestamp:number}>} [deps.getBlock]
 * @param {number} [deps.maxWagersPerCall]
 */
export async function hydrateWagerTimestamps(wagers = [], chainId, deps = {}) {
  const needsHydration = wagers.filter((w) => !(Number(w.createdAt) > 0))
  if (needsHydration.length === 0) return wagers

  let dataSource = null
  const getWagerEvents =
    deps.getWagerEvents ||
    ((id) => {
      if (!dataSource) dataSource = createReportDataSource({ chainId, provider: deps.provider })
      return dataSource.getWagerEvents(id)
    })
  const getBlock =
    deps.getBlock ||
    ((n) => {
      if (!dataSource) dataSource = createReportDataSource({ chainId, provider: deps.provider })
      return dataSource.getBlock(n)
    })
  const maxWagersPerCall = deps.maxWagersPerCall ?? DEFAULT_MAX_WAGERS_PER_CALL

  const cache = readCache(chainId)
  let cacheDirty = false
  let scanned = 0

  const timesById = new Map()
  for (const w of needsHydration) {
    const id = String(w.id)
    if (cache[id]) {
      timesById.set(id, cache[id])
      continue
    }
    if (scanned >= maxWagersPerCall) continue // hydrate the rest on later polls
    scanned += 1
    try {
      const events = await getWagerEvents(id)
      const blockTimeMs = new Map()
      const timeOf = async (blockNumber) => {
        if (!blockTimeMs.has(blockNumber)) {
          const block = await getBlock(blockNumber)
          const sec = Number(block?.timestamp)
          blockTimeMs.set(blockNumber, sec > 0 ? sec * 1000 : null)
        }
        return blockTimeMs.get(blockNumber)
      }
      let createdAtMs = null
      let resolvedAtMs = null
      for (const ev of events || []) {
        const name = ev.name || ev.fragment?.name || ev.eventName
        if (CREATION_EVENTS.has(name)) createdAtMs = await timeOf(ev.blockNumber)
        else if (SETTLEMENT_EVENTS.has(name)) resolvedAtMs = await timeOf(ev.blockNumber)
      }
      if (createdAtMs != null || resolvedAtMs != null) {
        const entry = { createdAtMs, resolvedAtMs }
        timesById.set(id, entry)
        cache[id] = entry
        cacheDirty = true
      }
    } catch {
      // Budget exhausted or scan failed — leave this wager's times untouched
      // (renders "date unavailable"), retry on a later poll.
    }
  }

  if (cacheDirty) writeCache(chainId, cache)

  return wagers.map((w) => {
    const t = timesById.get(String(w.id))
    if (!t) return w
    return {
      ...w,
      createdAt: t.createdAtMs ?? w.createdAt,
      resolvedAt: t.resolvedAtMs ?? w.resolvedAt,
    }
  })
}

export default hydrateWagerTimestamps
