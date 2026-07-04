/**
 * Idempotent intent dedup on the uniquenessMarker (FR-008, SC-006).
 *
 * Keyed by `${chainId}:${uniquenessMarker}` (markers are per-network; FR-024 keeps networks
 * isolated). States:
 *   - in-flight  -> a concurrent duplicate is coalesced: 409 duplicate_in_flight
 *   - completed  -> a repeat of a confirmed intent returns 200 with the ORIGINAL result,
 *                   no second on-chain submission, no second gas spend
 *   - failed     -> retryable: the on-chain nonce was never consumed, so a fresh attempt is safe
 *
 * The marker is reserved at the dedup step (before screening/quotas) so two concurrent identical
 * requests can never both reach the engine; any later pipeline rejection releases the reservation.
 *
 * Phase 1: in-process Map (single instance). Phase 2: shared Redis (SET NX + TTL) so limits and
 * dedup hold across instances — see research.md §3.
 */
export function createDedupStore({ now = () => Date.now(), ttlMs = 48 * 3600 * 1000 } = {}) {
  /** @type {Map<string, {state: 'inflight'|'completed'|'failed', intentId: string, at: number}>} */
  const entries = new Map()

  const keyOf = (chainId, marker) => `${chainId}:${marker.toLowerCase()}`

  function sweep() {
    const cutoff = now() - ttlMs
    for (const [k, e] of entries) {
      if (e.at < cutoff && e.state !== 'inflight') entries.delete(k)
    }
  }

  return {
    /** Look up the marker without reserving. */
    check(chainId, marker) {
      const e = entries.get(keyOf(chainId, marker))
      if (!e || e.state === 'failed') return { state: 'none' }
      return { state: e.state, intentId: e.intentId }
    },

    /**
     * Atomically reserve the marker for a new submission.
     * @returns {{ok: true} | {ok: false, state: 'inflight'|'completed', intentId: string}}
     */
    reserve(chainId, marker, intentId) {
      sweep()
      const k = keyOf(chainId, marker)
      const e = entries.get(k)
      if (e && e.state !== 'failed') return { ok: false, state: e.state, intentId: e.intentId }
      entries.set(k, { state: 'inflight', intentId, at: now() })
      return { ok: true }
    },

    /** Release a reservation after a downstream rejection (marker never reached the engine). */
    release(chainId, marker) {
      entries.delete(keyOf(chainId, marker))
    },

    markCompleted(chainId, marker) {
      const k = keyOf(chainId, marker)
      const e = entries.get(k)
      if (e) {
        e.state = 'completed'
        e.at = now()
      }
    },

    markFailed(chainId, marker) {
      const k = keyOf(chainId, marker)
      const e = entries.get(k)
      if (e) {
        e.state = 'failed'
        e.at = now()
      }
    },
  }
}
