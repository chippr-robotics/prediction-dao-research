/**
 * Keyed TTL cache with single-flight de-dup and serve-stale-on-error, for the read-only
 * OpenSea proxy (spec 055 FR-008). Generalizes the /healthz cache pattern in server.js:
 * at most one upstream fetch per key per TTL window regardless of request rate
 * (anti-amplification), and an upstream failure degrades to the last good value marked
 * `stale: true` instead of erroring.
 *
 * In-process by design — the gateway runs --max-instances=1 (README, Phase 1) so
 * process-local state IS the shared state. Bounded: oldest entries are evicted past
 * maxEntries so a scan of many wallets can't grow memory without limit.
 */

export function createTtlCache({ maxEntries = 2000, now = () => Date.now() } = {}) {
  /** @type {Map<string, {at: number, value: unknown, inflight: Promise<unknown>|null}>} */
  const entries = new Map()

  function evict() {
    while (entries.size > maxEntries) {
      let oldestKey = null
      let oldestAt = Infinity
      for (const [k, e] of entries) {
        if (e.at < oldestAt) {
          oldestAt = e.at
          oldestKey = k
        }
      }
      entries.delete(oldestKey)
    }
  }

  return {
    /**
     * Return the cached value for `key` when fresher than `ttlMs`; otherwise run `loader`
     * (coalescing concurrent callers into one flight). On loader failure a previously
     * cached value is served with stale=true; with nothing cached the error propagates.
     *
     * @template T
     * @param {string} key
     * @param {number} ttlMs
     * @param {() => Promise<T>} loader
     * @returns {Promise<{value: T, fetchedAt: number, stale: boolean}>}
     */
    async fetchThrough(key, ttlMs, loader) {
      const entry = entries.get(key)
      if (entry && entry.value !== undefined && now() - entry.at < ttlMs) {
        return { value: entry.value, fetchedAt: entry.at, stale: false }
      }
      const current = entries.get(key) ?? { at: 0, value: undefined, inflight: null }
      if (!current.inflight) {
        current.inflight = loader().then(
          (value) => {
            current.at = now()
            current.value = value
            current.inflight = null
            return value
          },
          (err) => {
            current.inflight = null
            throw err
          }
        )
        entries.set(key, current)
        evict()
      }
      try {
        const value = await current.inflight
        return { value, fetchedAt: current.at, stale: false }
      } catch (err) {
        if (current.value !== undefined) {
          return { value: current.value, fetchedAt: current.at, stale: true }
        }
        throw err
      }
    },

    /** @returns {number} current entry count (tests/telemetry) */
    size() {
      return entries.size
    },
  }
}
