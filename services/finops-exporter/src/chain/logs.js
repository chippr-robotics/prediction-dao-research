/**
 * Chunked, resumable event-log scanning (spec 089).
 *
 * Public RPC endpoints cap `eth_getLogs` ranges (commonly 1k–10k blocks) and answer an over-wide
 * range with an error rather than a truncated result. Scanning in chunks is therefore not an
 * optimisation — an unchunked scan simply fails on every provider we use.
 *
 * The cursor is what makes the counters cumulative: each pass resumes where the last finished, so a
 * revenue counter accumulates instead of re-reporting the same window forever.
 */

const DEFAULT_CHUNK = 2_000

/**
 * Scan `[fromBlock, toBlock]` for a filter, in chunks.
 *
 * Throws on failure rather than returning partial results. A partial log scan silently understates
 * revenue, and an understated revenue number that looks successful is worse than a source that
 * honestly reports itself unreadable (FR-006).
 */
export async function scanLogs(provider, filter, fromBlock, toBlock, { chunk = DEFAULT_CHUNK } = {}) {
  const out = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, toBlock)
    const logs = await provider.getLogs({ ...filter, fromBlock: start, toBlock: end })
    out.push(...logs)
  }
  return out
}

/**
 * Per-(chain, topic) scan cursors.
 *
 * In memory only. On restart the exporter resumes from `head - lookbackBlocks`, so counters restart
 * from that point — which the dashboard states as "since exporter start" rather than implying
 * all-time totals it does not have. Persisting cursors would mean owning a datastore, and a
 * datastore whose corruption silently understates revenue is a worse failure than a documented
 * restart boundary.
 */
export function createCursorStore() {
  const cursors = new Map()
  return {
    get(key, fallback) {
      return cursors.get(key) ?? fallback
    },
    set(key, block) {
      cursors.set(key, block)
    },
    /** Cumulative totals survive a cursor advance; the cursor only says where to read NEXT. */
    accumulate(key, delta) {
      const k = `total:${key}`
      const next = (cursors.get(k) ?? 0n) + delta
      cursors.set(k, next)
      return next
    },
    total(key) {
      return cursors.get(`total:${key}`) ?? 0n
    },
  }
}
