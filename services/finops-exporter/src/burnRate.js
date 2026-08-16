/**
 * Burn rate and runway for prepaid pools (spec 089, FR-015, research R6).
 *
 * WHY RUNWAY AND NOT A BALANCE FLOOR. A "safe" balance is only safe at the burn rate it was chosen
 * for. At 10x traffic the same floor is minutes of warning. Alerting on `balance / burn` keeps the
 * threshold meaningful as volume changes, with nobody editing a number.
 *
 * THE INFINITY TRAP. When burn rate is zero or not yet known, runway is mathematically infinite or
 * undefined. Emitting `+Inf` would be read by every alert rule as "enormous runway, all is well" —
 * the healthiest-looking possible output for a pool we know nothing about. So runway is `null` and
 * the metric is ABSENT, which alerts can detect and a threshold cannot silently pass.
 */

/** Samples older than this are dropped from the trailing window. */
const DEFAULT_WINDOW_SEC = 24 * 3600

/** Below this many samples the rate is not trustworthy; two points spanning seconds is noise. */
const MIN_SAMPLES = 3

export function createBurnTracker({ windowSec = DEFAULT_WINDOW_SEC, now = () => Date.now() } = {}) {
  /** @type {Map<string, Array<{at: number, balance: number}>>} */
  const history = new Map()

  return {
    /** Record a balance observation for a pool. Only call this with a value that was actually read. */
    observe(poolId, balance, at = now()) {
      const samples = history.get(poolId) ?? []
      samples.push({ at, balance })
      const cutoff = at - windowSec * 1000
      // Keep one sample before the cutoff so a window that just filled still has a baseline.
      let firstKeep = samples.findIndex((s) => s.at >= cutoff)
      if (firstKeep > 0) samples.splice(0, firstKeep - 1)
      history.set(poolId, samples)
    },

    /**
     * Burn per second over the trailing window, or `null` when it cannot be known.
     *
     * Only DECREASES count as burn. A top-up raises the balance, and a naive
     * (first - last) / elapsed over a window containing one would report negative burn — which is
     * "infinite runway" wearing a different hat. Summing only the downward steps gives the spend
     * regardless of how many times the pool was refilled.
     */
    burnRatePerSec(poolId) {
      const samples = history.get(poolId)
      if (!samples || samples.length < MIN_SAMPLES) return null

      const elapsedSec = (samples[samples.length - 1].at - samples[0].at) / 1000
      if (elapsedSec <= 0) return null

      let spent = 0
      for (let i = 1; i < samples.length; i++) {
        const delta = samples[i - 1].balance - samples[i].balance
        if (delta > 0) spent += delta
      }
      if (spent <= 0) return 0
      return spent / elapsedSec
    },

    /**
     * Seconds until the pool empties, or `null` when unknowable.
     *
     * `null` when: the balance was not read, the burn rate is not yet known, or burn is zero. All
     * three are "we cannot say", and none of them may render as a large number.
     */
    runwaySeconds(poolId, balance) {
      if (typeof balance !== 'number' || !Number.isFinite(balance)) return null
      const rate = this.burnRatePerSec(poolId)
      if (rate == null || rate <= 0) return null
      return balance / rate
    },

    /** Cumulative spend over the window — the pool's contribution to cost, net of top-ups. */
    spentInWindow(poolId) {
      const samples = history.get(poolId)
      if (!samples || samples.length < 2) return null
      let spent = 0
      for (let i = 1; i < samples.length; i++) {
        const delta = samples[i - 1].balance - samples[i].balance
        if (delta > 0) spent += delta
      }
      return spent
    },

    /** Test seam. */
    _history: history,
  }
}
