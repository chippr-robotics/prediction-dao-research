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
