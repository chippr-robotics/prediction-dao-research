/**
 * Per-endpoint-class TTLs for the /v1/bitcoin/* proxy (spec 061), plus the degraded-stamps
 * re-fetch helper. The cache STORE itself is the shared generic TTL cache (single-flight +
 * serve-stale + bounded entries) from src/opensea/cache.js — the same util the Polymarket
 * proxy reuses; keys are prefixed per endpoint class and the TTL is chosen per call.
 *
 * Contract TTLs (bitcoin-gateway-api.md): fees 30s; balances/UTXOs 15s; tx status 15s;
 * stamps 300s — but a DEGRADED stamps result is honored for at most 30s so recovery is fast
 * (a healthy indexer un-degrades within half a minute instead of five).
 */
export { createTtlCache } from '../opensea/cache.js'

export const FEES_TTL_MS = 30_000
export const ADDRESSES_TTL_MS = 15_000
export const TX_STATUS_TTL_MS = 15_000
export const STAMPS_TTL_MS = 300_000
export const STAMPS_DEGRADED_TTL_MS = 30_000

/**
 * fetchThrough with a value-dependent TTL: a healthy stamps result lives the full 300s, a
 * degraded one at most 30s. First pass reads at the long TTL (cheap cache hit for healthy
 * results); when the cached value turns out degraded AND older than the short TTL, a second
 * pass at the short TTL forces the loader. Stamps loaders never throw (they return
 * `{degraded: true}` instead), so the cache's serve-stale path is not in play here.
 *
 * @param {{fetchThrough: Function}} cache
 * @param {string} key
 * @param {() => number} now unix milliseconds
 * @param {() => Promise<{degraded: boolean, stamps: Array}>} loader
 */
export async function fetchStampsThrough(cache, key, now, loader) {
  let result = await cache.fetchThrough(key, STAMPS_TTL_MS, loader)
  if (result.value?.degraded && now() - result.fetchedAt >= STAMPS_DEGRADED_TTL_MS) {
    result = await cache.fetchThrough(key, STAMPS_DEGRADED_TTL_MS, loader)
  }
  return result
}
