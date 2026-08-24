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

/**
 * Split `[from..to]` into INCLUSIVE ranges no wider than `LOG_SCAN_CHUNK` blocks.
 *
 * The one definition of "how wide is a chunk" in this app. Note the arithmetic: a request for
 * `fromBlock..fromBlock + LOG_SCAN_CHUNK - 1` spans exactly `LOG_SCAN_CHUNK` blocks because both
 * ends are inclusive — the off-by-one that turns a 10,000-block cap into a 10,001-block request is
 * the whole failure mode this module exists to prevent, so it is written down once and only once.
 *
 * @param {number} from - first block, inclusive
 * @param {number} to - last block, inclusive
 * @param {number} [limit] - stop after this many chunks (a budget); omit for the whole range
 */
function planChunks(from, to, limit = Infinity) {
  const chunks = []
  let cursor = from
  while (cursor <= to && chunks.length < limit) {
    const end = Math.min(cursor + LOG_SCAN_CHUNK - 1, to)
    chunks.push({ from: cursor, to: end })
    cursor = end + 1
  }
  return chunks
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
 * @param {number} [args.toBlock] - inclusive ceiling on BOTH the scan and the answer; defaults to the head
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

  // `toBlock` is a CEILING ON THE ANSWER, not just on the scan. The cache is keyed without it (one
  // entry per contract+filter, or a moving head would fragment it into uselessness), so a cache
  // already filled past an explicit ceiling must be trimmed back to it rather than handing the
  // caller blocks it excluded.
  const answer = () => {
    if (toBlock == null) return { logs: entry.logs, scannedTo: entry.scannedTo, complete: entry.scannedTo >= head }
    return {
      logs: entry.logs.filter((l) => l.blockNumber <= toBlock),
      scannedTo: Math.min(entry.scannedTo, toBlock),
      complete: entry.scannedTo >= toBlock,
    }
  }

  // Head can move backwards across a reorg or a load-balanced endpoint; never rewind the cursor
  // (that would re-append logs already held) and never claim to have scanned past the head.
  if (entry.scannedTo >= head) {
    cache.set(key, entry)
    return answer()
  }

  const base = { address, topics }
  let cursor = entry.scannedTo + 1
  let spent = 0

  while (cursor <= head && spent < maxChunks) {
    // One wave of concurrent chunks, still inside the budget.
    const wave = planChunks(cursor, head, Math.min(CONCURRENCY, maxChunks - spent))
    cursor = wave[wave.length - 1].to + 1
    spent += wave.length
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

  return answer()
}

/**
 * One bounded, chunked sweep of a fixed block range. Raw logs, no cache, no cursor, no decoding.
 *
 * `scanLogs` above is built for HISTORY: a fixed `fromBlock` (a deploy block) that never moves, so
 * a session cache and a resumable watermark are pure wins. This is the other shape — a SLIDING
 * window anchored to the head ("the last six hours"), read by a caller that must be able to derive
 * its answer afresh every time:
 *
 *   - the anchor moves with every call, so `scanLogs`' key (which contains `fromBlock`) would
 *     fragment into a new cache entry per poll: never a hit, and an unbounded Map;
 *   - a watermark that never rewinds is exactly wrong for a reorg-sensitive read. `scanLogs` may
 *     keep serving a log the chain has dropped, which for a caller that turns one log into "your
 *     money arrived" is the single worst answer available. Re-deriving costs requests; it cannot
 *     be stale.
 *
 * What IS shared with `scanLogs` — and the reason this lives here rather than in the caller — is
 * the policy: `planChunks` for the width, `getLogsRange` for the narrow retry, `CONCURRENCY` for
 * the request rate. Those must never diverge between the two shapes.
 *
 * Throws when a range cannot be read even at the narrow width, for the same reason `scanLogs` does:
 * a silently skipped range is indistinguishable from "nothing happened there". Callers that must
 * degrade honestly catch it and report "no new information" — never a negative result.
 *
 * @param {object} args
 * @param {object} args.provider - anything with `getLogs`
 * @param {string} args.address - the contract to read
 * @param {Array} args.topics - an `eth_getLogs` topics array (topic0 may itself be an OR-set)
 * @param {number} args.fromBlock - first block, inclusive
 * @param {number} args.toBlock - last block, inclusive. A NUMBER, never `'latest'`: a range with an
 *   open end cannot be chunked, which is how an over-cap request gets issued in the first place.
 * @returns {Promise<object[]>} every raw log in the range, in no particular order
 */
export async function scanLogRange({ provider, address, topics, fromBlock, toBlock }) {
  if (!provider?.getLogs) throw new Error('logScan: no provider')
  const from = Number(fromBlock)
  const to = Number(toBlock)
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('logScan: scanLogRange needs numeric block bounds')
  if (to < from) return []

  const base = { address, topics }
  const chunks = planChunks(from, to)
  const out = []
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const wave = chunks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(wave.map((w) => getLogsRange(provider, base, w.from, w.to)))
    out.push(...results.flat())
  }
  return out
}

export default scanLogs
