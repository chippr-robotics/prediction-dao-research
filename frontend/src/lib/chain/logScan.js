/**
 * Bounded, resumable `eth_getLogs` scanning — the one way this app reads event history.
 *
 * WHY THIS EXISTS. Every public RPC caps the block range of a single `eth_getLogs`; the app's own
 * default Polygon endpoint caps it at 10,000 blocks and answers anything wider with
 * `-32701 exceed maximum block range: 10000`. Callers that handed a contract's deploy block
 * straight to `queryFilter` were therefore asking for ~2,000,000 blocks in one request and getting
 * a hard error on every single call — the Protect proposal queue and the membership voucher scan
 * were both dead on Polygon for exactly this reason, and the activity poller turned the first of
 * those into a red "Couldn't refresh some activity" banner on every session (issue: activity
 * refresh error).
 *
 * Three things make the naive fix ("just chunk it") wrong on its own, and all three are handled
 * here rather than in each caller:
 *
 *  1. **Chunking multiplies requests.** 2.1M blocks at 10k a chunk is 216 requests. Doing that on
 *     every 30s activity poll would be far worse than the single failing request it replaced. So a
 *     completed scan is CACHED for the session and later calls only ask for blocks that are new.
 *  2. **The first backfill still costs those requests.** Callers may pass `maxChunks` to bound one
 *     invocation; the scan then stops early, reports `complete: false`, and RESUMES from its cursor
 *     on the next call. A background poller spends a few requests per cycle and converges; a
 *     foreground read the member is waiting on can spend the lot.
 *  3. **A partial scan is not a complete one, and must never be presented as one.** `complete` is
 *     part of the result, not an afterthought — a caller that ignores it will render "no pending
 *     proposals" from a scan that simply has not reached them yet. That is the same class of lie
 *     the honest-state rule exists to prevent (Constitution III), so it is the caller's job to say
 *     "still catching up", and this module's job to always tell them which they have.
 *
 * Events that share a contract are scanned TOGETHER (one request per chunk for the whole group,
 * via a topic0 OR-set) rather than once per event — the difference between 8 backfills and 3 for a
 * custody vault. Group only events whose remaining indexed topics match; `eventName` on each
 * returned log tells them apart afterwards.
 *
 * A chunk that fails is retried in narrower sub-chunks (some endpoints cap by result size, not
 * range). A sub-chunk that still fails THROWS: a silently skipped range is a hole in history that
 * looks exactly like "nothing happened".
 */

/** Widest range asked for in one request — the common public-RPC cap. */
export const LOG_SCAN_CHUNK = 10_000
/** Narrower retry, for endpoints that cap by result size rather than by range. */
export const LOG_SCAN_FALLBACK_CHUNK = 1_000
/** In-flight chunks per scan. Enough to backfill at a usable speed, few enough to be a good citizen. */
const CONCURRENCY = 4

/** key -> { scannedTo, logs } for one browser session. Never persisted: cheap to rebuild, and a
 *  stale watermark across releases would silently skip history. */
const cache = new Map()

/** Drop all cached scans (tests, and the account/network swap path if one is ever needed). */
export function clearLogScanCache() {
  cache.clear()
}

/**
 * Resolve `contract.filters.X(...)` (a DeferredTopicFilter) or a plain topics array to topic values.
 */
async function topicsOf(filter) {
  if (Array.isArray(filter)) return filter
  if (typeof filter?.getTopicFilter === 'function') return filter.getTopicFilter()
  if (Array.isArray(filter?.topics)) return filter.topics
  throw new Error('logScan: unsupported filter')
}

/**
 * Merge several single-event filters into one `{ topics }` for a combined request.
 * Every filter must agree on topics 1..n and differ only in topic0.
 */
function mergeTopics(topicSets) {
  const [first, ...rest] = topicSets
  const tail = first.slice(1)
  for (const t of rest) {
    const otherTail = t.slice(1)
    if (JSON.stringify(otherTail) !== JSON.stringify(tail)) {
      throw new Error('logScan: filters differ beyond topic0 and cannot be merged')
    }
  }
  const topic0 = topicSets.map((t) => t[0])
  return [topic0.length === 1 ? topic0[0] : topic0, ...tail]
}

/** One range, with a narrower retry before giving up. Throws when even the narrow pass fails. */
async function getLogsRange(provider, base, from, to) {
  try {
    return await provider.getLogs({ ...base, fromBlock: from, toBlock: to })
  } catch (err) {
    if (to - from + 1 <= LOG_SCAN_FALLBACK_CHUNK) throw err
    const out = []
    for (let s = from; s <= to; s += LOG_SCAN_FALLBACK_CHUNK) {
      const e = Math.min(s + LOG_SCAN_FALLBACK_CHUNK - 1, to)
      out.push(...(await provider.getLogs({ ...base, fromBlock: s, toBlock: e })))
    }
    return out
  }
}

/** Decode a raw log against the contract's interface. Undecodable logs are dropped, not guessed. */
function decode(contract, log) {
  let parsed
  try {
    parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data })
  } catch {
    return null
  }
  if (!parsed) return null
  return {
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    index: log.index,
    args: parsed.args,
    eventName: parsed.name,
  }
}

/**
 * Scan one contract's event history in bounded, resumable chunks.
 *
 * @param {object} args
 * @param {import('ethers').Contract} args.contract - supplies the address, the provider and the decoder
 * @param {Array} args.filters - one or more `contract.filters.X(...)`; grouped into one request per chunk
 * @param {number} args.fromBlock - the recorded deploy block. NEVER 0 for a live contract.
 * @param {number|string} args.chainId - part of the cache key; an address alone repeats across chains
 * @param {number} [args.toBlock] - defaults to the current head
 * @param {number} [args.maxChunks] - chunks this invocation may spend; omit for "as many as it takes"
 * @param {string} [args.cacheKey] - override the derived key (tests)
 * @returns {Promise<{logs: object[], scannedTo: number, complete: boolean}>} `logs` is every log
 *   found from `fromBlock` up to `scannedTo`, accumulated across calls. `complete` is false when
 *   the budget ran out before the head — the caller MUST disclose that rather than treat the
 *   result as the whole history.
 */
export async function scanLogs({ contract, filters, fromBlock, chainId, toBlock, maxChunks = Infinity, cacheKey }) {
  const provider = contract.runner?.provider ?? contract.runner
  if (!provider?.getLogs) throw new Error('logScan: contract has no provider')

  const list = Array.isArray(filters) ? filters : [filters]
  const topics = mergeTopics(await Promise.all(list.map(topicsOf)))
  const address = contract.target
  const key = cacheKey || JSON.stringify([String(chainId), String(address), topics, fromBlock])

  const head = toBlock ?? (await provider.getBlockNumber())
  const entry = cache.get(key) || { scannedTo: Number(fromBlock) - 1, logs: [] }

  // Head can move backwards across a reorg or a load-balanced endpoint; never rewind the cursor
  // (that would re-append logs already held) and never claim to have scanned past the head.
  if (entry.scannedTo >= head) {
    cache.set(key, entry)
    return { logs: entry.logs, scannedTo: entry.scannedTo, complete: true }
  }

  const base = { address, topics }
  let cursor = entry.scannedTo + 1
  let spent = 0

  while (cursor <= head && spent < maxChunks) {
    // One wave of concurrent chunks, still inside the budget.
    const wave = []
    for (let i = 0; i < CONCURRENCY && cursor <= head && spent < maxChunks; i += 1) {
      const from = cursor
      const to = Math.min(from + LOG_SCAN_CHUNK - 1, head)
      wave.push({ from, to })
      cursor = to + 1
      spent += 1
    }
    // A throw here abandons the wave WITHOUT advancing the cursor past it: the caller sees the
    // failure, and the next attempt re-scans from the last block actually accounted for.
    const results = await Promise.all(wave.map((w) => getLogsRange(provider, base, w.from, w.to)))
    for (const raw of results.flat()) {
      const d = decode(contract, raw)
      if (d) entry.logs.push(d)
    }
    entry.scannedTo = wave[wave.length - 1].to
    cache.set(key, entry)
  }

  return { logs: entry.logs, scannedTo: entry.scannedTo, complete: entry.scannedTo >= head }
}

export default scanLogs
