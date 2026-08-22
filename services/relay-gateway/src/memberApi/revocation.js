/**
 * Member API key revocations (spec 095).
 *
 * Phase 1: in-process (single instance), exactly like intent/store.js, policy/dedup.js and
 * policy/quotas.js. Phase 2: shared Redis so a revocation is not multiplied by instance count —
 * the same follow-up those three carry, and for once the honesty matters to a member rather than
 * to an operator, so it is stated in the RESPONSE and not only in a comment: every revocation
 * answer carries `durable: false`.
 *
 * WHY THAT IS ACCEPTABLE RATHER THAN BROKEN
 * The gateway is stateless by construction — the container declares no volume — and a capability
 * token is not a session it can invalidate by forgetting something. What actually bounds a leaked
 * grant is the grant's OWN `expiresAt`, which the member chose and the gateway caps
 * (`MEMBER_API_MAX_TTL_DAYS`). This store is a fast path on top of that bound, not a substitute for
 * it, and the API says so in words a member can act on: re-submit after a restart, or wait out the
 * expiry that is already signed into the token.
 *
 * PRUNING, NOT EVICTION-BY-AGE-ALONE. Records older than the TTL cap are dropped because no grant
 * can still be live past that point, so the record cannot matter any more. Only if that leaves the
 * store over its hard cap does it evict the OLDEST surviving record, with a warning — dropping a
 * live revocation is the one failure here worth shouting about, and silently refusing new ones
 * instead would be strictly worse (the member would be told a key was withdrawn when it was not).
 */

const DAY_MS = 86_400_000

const keyFor = (account, keyId) => `${String(account).toLowerCase()}:${String(keyId).toLowerCase()}`

/**
 * @param {{maxTtlDays?: number, maxEntries?: number, now?: () => number, log?: (msg: string) => void}} [opts]
 */
export function createRevocationStore({ maxTtlDays = 90, maxEntries = 50_000, now = () => Date.now(), log = (m) => console.warn(m) } = {}) {
  /** @type {Map<string, {account: string, keyId: string, revokedAtMs: number}>} insertion-ordered */
  const records = new Map()

  function prune() {
    // A grant cannot outlive the TTL cap, so a revocation older than that governs nothing.
    const cutoff = now() - maxTtlDays * DAY_MS
    for (const [k, rec] of records) {
      if (rec.revokedAtMs <= cutoff) records.delete(k)
    }
    while (records.size > maxEntries) {
      const oldest = records.keys().next().value
      records.delete(oldest)
      log(
        '[relay-gateway] member-API revocation store is over its cap; evicted the oldest record. ' +
          'A revoked key may now be accepted again until its own expiry — raise MEMBER_API_REVOCATION_MAX or move this store to Redis.'
      )
    }
  }

  return {
    /** In-process only. Reported to members verbatim so nobody infers a durability that is absent. */
    durable: false,

    /**
     * Record a revocation. Idempotent: re-revoking the same key is not an error, and the FIRST
     * `revokedAt` wins — a later replay must not extend how long the record is kept.
     * @param {string} account
     * @param {string} keyId
     * @param {number} [revokedAtSec] unix seconds from the signed struct
     */
    revoke(account, keyId, revokedAtSec) {
      const k = keyFor(account, keyId)
      if (!records.has(k)) {
        records.set(k, {
          account: String(account).toLowerCase(),
          keyId: String(keyId).toLowerCase(),
          // The signed timestamp is the member's claim; clamp it to "not in the future" so a
          // skewed or hostile value cannot keep a record alive past the pruning window.
          revokedAtMs: Math.min(Number(revokedAtSec ?? 0) * 1000 || now(), now()),
        })
        prune()
      }
      return { revoked: true, durable: false }
    },

    /** @returns {boolean} */
    isRevoked(account, keyId) {
      const rec = records.get(keyFor(account, keyId))
      if (!rec) return false
      if (rec.revokedAtMs <= now() - maxTtlDays * DAY_MS) {
        records.delete(keyFor(account, keyId))
        return false
      }
      return true
    },

    /** Records currently held — operational visibility only; never a member-facing number. */
    size() {
      return records.size
    },
  }
}
