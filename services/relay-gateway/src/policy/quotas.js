/**
 * Per-signer + global quotas and the per-chain per-window gas spend cap (FR-014, FR-018's
 * per-window rate cap; SC-006 "no gas-wallet drain").
 *
 * Sliding-window counters over timestamps, with TTL cleanup on access. Phase 1: in-process
 * (single instance). Phase 2: shared Redis atomic INCR+TTL so limits are NOT multiplied by
 * instance count (FR-012, SC-012) — see research.md §3.
 */

export function createQuotas({ signerPerWindow, globalPerWindow, windowMs, now = () => Date.now() }) {
  /** @type {Map<string, number[]>} signer -> accept timestamps */
  const perSigner = new Map()
  /** @type {number[]} */
  let global = []

  function prune(arr, cutoff) {
    // Timestamps are appended in order; find the first still-live index.
    let i = 0
    while (i < arr.length && arr[i] <= cutoff) i += 1
    return i > 0 ? arr.slice(i) : arr
  }

  function retryAfterSec(arr, cutoffMs) {
    if (arr.length === 0) return 1
    return Math.max(1, Math.ceil((arr[0] + cutoffMs - now()) / 1000))
  }

  return {
    /**
     * Count one acceptance attempt against the signer + global windows.
     * @returns {{allowed: true} | {allowed: false, scope: 'signer'|'global', retryAfterSec: number}}
     */
    hit(signer) {
      const t = now()
      const cutoff = t - windowMs
      const key = signer.toLowerCase()

      let mine = prune(perSigner.get(key) ?? [], cutoff)
      global = prune(global, cutoff)

      if (mine.length >= signerPerWindow) {
        perSigner.set(key, mine)
        return { allowed: false, scope: 'signer', retryAfterSec: retryAfterSec(mine, windowMs) }
      }
      if (global.length >= globalPerWindow) {
        return { allowed: false, scope: 'global', retryAfterSec: retryAfterSec(global, windowMs) }
      }
      mine = [...mine, t]
      perSigner.set(key, mine)
      global.push(t)

      // TTL cleanup: drop empty signer buckets opportunistically to bound memory.
      if (perSigner.size > 10_000) {
        for (const [k, arr] of perSigner) {
          if (prune(arr, cutoff).length === 0) perSigner.delete(k)
        }
      }
      return { allowed: true }
    },
  }
}

/**
 * Per-account + gateway-wide MODEL TOKEN budget over a rolling window.
 *
 * WHY THIS IS NOT A QUOTA. `createQuotas` counts REQUESTS, and a request count is a poor proxy for
 * model spend: two calls inside one window can differ by three orders of magnitude in what they
 * cost. Counting the thing that is actually billed — tokens — is the only ceiling that bounds money
 * rather than traffic.
 *
 * WHY RESERVE-THEN-SETTLE AND NOT COUNT-AFTERWARDS. A turn's real cost is knowable only once the
 * provider has answered, so a design that merely accumulates the counts it sees can be overshot by
 * every request that is already in flight when the budget runs out. So a caller RESERVES the worst
 * case this turn could cost before the call is made — which is bounded, because the output ceiling
 * is `ASSISTANT_MAX_TOKENS` and boot refuses a budget smaller than one turn — and then SETTLES the
 * reservation down to the measured usage. Between those two points the budget is committed, so
 * concurrent turns cannot each spend the same headroom.
 *
 * AN UNKNOWN COST IS NEVER ZERO. `settle(null)` leaves the reservation standing, because a provider
 * that returned no usage counts still billed us for something; writing 0 there would be a
 * fabricated fact of exactly the shape this estate refuses everywhere else. The same reasoning
 * applies to a turn that fails after the request was sent: the caller simply does not settle it.
 */
export function createTokenBudget({ perAccountPerWindow, globalPerWindow, windowMs, now = () => Date.now() }) {
  /** @type {Map<string, Array<{t: number, tokens: number}>>} account -> live charges */
  const perAccount = new Map()
  /** @type {Array<{t: number, tokens: number}>} the SAME entry objects, so a settle updates both views */
  let global = []

  const live = (arr, cutoff) => arr.filter((e) => e.t > cutoff)
  const total = (arr) => arr.reduce((acc, e) => acc + e.tokens, 0)
  const retryAfterSec = (arr, t) => {
    const oldest = arr[0]?.t ?? t
    return Math.max(1, Math.ceil((oldest + windowMs - t) / 1000))
  }

  return {
    /**
     * Commit `reservation` tokens for one turn, before it is made.
     *
     * @param {string} account the member (or payer) the turn is billed to
     * @param {number} reservation worst-case tokens this turn can cost
     * @returns {{allowed: true, settle: (actualTokens: number|null) => void}
     *          | {allowed: false, scope: 'account'|'global', spentTokens: number, budgetTokens: number, retryAfterSec: number}}
     */
    reserve(account, reservation) {
      const t = now()
      const cutoff = t - windowMs
      const key = String(account).toLowerCase()
      const want = Math.max(0, Math.round(Number(reservation) || 0))

      const mine = live(perAccount.get(key) ?? [], cutoff)
      global = live(global, cutoff)
      perAccount.set(key, mine)

      // `+ want >` rather than `>=`: the committed total may never EXCEED the budget, which is what
      // makes this a ceiling on spend rather than a report of one. Boot guarantees the budget is at
      // least one turn's worst case, so a first turn always fits.
      const spentMine = total(mine)
      if (spentMine + want > perAccountPerWindow) {
        return { allowed: false, scope: 'account', spentTokens: spentMine, budgetTokens: perAccountPerWindow, retryAfterSec: retryAfterSec(mine, t) }
      }
      const spentAll = total(global)
      if (spentAll + want > globalPerWindow) {
        return { allowed: false, scope: 'global', spentTokens: spentAll, budgetTokens: globalPerWindow, retryAfterSec: retryAfterSec(global, t) }
      }

      const entry = { t, tokens: want }
      mine.push(entry)
      global.push(entry)

      // Bound memory the same way createQuotas does: drop accounts with nothing live.
      if (perAccount.size > 10_000) {
        for (const [k, arr] of perAccount) {
          if (live(arr, cutoff).length === 0) perAccount.delete(k)
        }
      }

      return {
        allowed: true,
        settle(actualTokens) {
          // Only a MEASURED count replaces the reservation. null/NaN keeps it — see the header.
          if (Number.isFinite(actualTokens) && actualTokens >= 0) entry.tokens = Math.round(actualTokens)
        },
      }
    },

    /** Tokens charged to an account inside the live window. Operational visibility; never a member fact. */
    spentFor(account) {
      const cutoff = now() - windowMs
      return total(live(perAccount.get(String(account).toLowerCase()) ?? [], cutoff))
    },
  }
}

/** Per-chain estimated-gas spend accumulator over a rolling window (FR-014 spend cap). */
export function createSpendTracker({ chains, windowMs, now = () => Date.now() }) {
  /** @type {Map<number, Array<{t: number, wei: bigint}>>} */
  const spends = new Map()

  return {
    /**
     * Try to add an estimated spend for a chain; refuses when the window cap would be exceeded.
     * @returns {{allowed: true} | {allowed: false, retryAfterSec: number}}
     */
    tryAdd(chainId, estimatedWei) {
      const cap = chains[chainId]?.gasSpendCapWei
      if (cap == null) return { allowed: true }
      const t = now()
      const cutoff = t - windowMs
      let arr = (spends.get(chainId) ?? []).filter((e) => e.t > cutoff)
      const current = arr.reduce((acc, e) => acc + e.wei, 0n)
      if (current + estimatedWei > cap) {
        spends.set(chainId, arr)
        const oldest = arr[0]?.t ?? t
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)) }
      }
      arr = [...arr, { t, wei: estimatedWei }]
      spends.set(chainId, arr)
      return { allowed: true }
    },
  }
}
