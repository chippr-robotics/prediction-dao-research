/**
 * The outcome of reading one contract on one chain — the central shape of spec 071.
 *
 * ── WHY THREE STATES AND NOT A VALUE-OR-NULL ────────────────────────────────────────────────
 * An operator auditing a control surface reads a silent `0` as a fact. So "the contract said
 * zero", "there is no contract here", and "the question could not be put" are three different
 * statements and must stay three different states (FR-014):
 *
 *   read          — the contract answered. `value` is a fact.
 *   not-deployed  — there is no such contract on this chain. A DEFINITE answer: there is
 *                   nothing here to have a value. Not the same as a zero.
 *   unreadable    — the endpoint was down, timed out, or answered garbage. NOT an answer.
 *                   Must never render as 0, as empty, or as absence.
 *
 * `value` exists only on `read`, deliberately: a consumer tempted to write `result.value ?? 0`
 * finds there is nowhere for that default to live, because the two non-answer states carry no
 * value at all.
 *
 * ── AND WHY THERE IS NO SUM-EVERYTHING FUNCTION ─────────────────────────────────────────────
 * `aggregate` returns subtotals keyed by unit and never one grand total (FR-022). Fee balances
 * on different chains are denominated in different tokens — Polygon USDC and Mordor's Classic
 * USD are not the same asset — so a single figure across them is an invented number. The API
 * offers no way to ask for one, which is the point: this cannot be got wrong by a caller in a
 * hurry.
 */

export const READ = 'read'
export const NOT_DEPLOYED = 'not-deployed'
export const UNREADABLE = 'unreadable'

/**
 * @typedef {object} Unit
 * @property {string} symbol   Display symbol, and the key subtotals are grouped by
 * @property {number} decimals
 * @property {string} [address]
 */

/**
 * The contract answered.
 * @param {number} chainId
 * @param {*} value
 * @param {Unit|null} [unit] required for balances, so they can never be cross-summed by accident
 * @param {number|null} [readAt] timestamp, for per-chain freshness
 */
export function readOk(chainId, value, unit = null, readAt = null) {
  return { chainId: Number(chainId), status: READ, value, unit, reason: null, readAt }
}

/** There is no such contract on this chain. A definite answer, not a failure. */
export function notDeployed(chainId) {
  return { chainId: Number(chainId), status: NOT_DEPLOYED, unit: null, reason: null, readAt: null }
}

/** The question could not be put. Never a value, always a reason. */
export function unreadable(chainId, reason) {
  return {
    chainId: Number(chainId),
    status: UNREADABLE,
    unit: null,
    reason: String(reason || 'chain could not be read'),
    readAt: null,
  }
}

export const isRead = (r) => r?.status === READ
export const isNotDeployed = (r) => r?.status === NOT_DEPLOYED
export const isUnreadable = (r) => r?.status === UNREADABLE

/**
 * Per-unit subtotals over a set of chain read results.
 *
 * Returns `{ subtotals, partial, missing }` — never a single figure:
 *
 *   subtotals — keyed by unit symbol. Values in different units land in different buckets.
 *   partial   — true when at least one chain could not be read, so a caller cannot present
 *               the result as complete without saying so (FR-023).
 *   missing   — the chains excluded, with the reason each was excluded.
 *
 * `not-deployed` chains contribute nothing and do NOT set `partial`: nothing is missing from
 * the total, there is simply nothing there. That distinction is why the two states exist.
 *
 * Values are summed as BigInt (raw token units). A `read` result carrying a non-BigInt-able
 * value is treated as unreadable for aggregation purposes rather than coerced — a silently
 * mis-scaled balance is worse than an admitted gap.
 */
export function aggregate(results = []) {
  const subtotals = {}
  const missing = []

  for (const r of results) {
    if (!r) continue
    if (isNotDeployed(r)) continue
    if (isUnreadable(r)) {
      missing.push({ chainId: r.chainId, reason: r.reason })
      continue
    }
    if (!isRead(r)) continue

    const symbol = r.unit?.symbol ?? null
    if (!symbol) {
      // A balance with no declared unit cannot be safely put in any bucket — bucketing it
      // under a guess is exactly how a cross-unit sum gets created.
      missing.push({ chainId: r.chainId, reason: 'value has no declared unit' })
      continue
    }

    let amount
    try {
      amount = BigInt(r.value)
    } catch {
      missing.push({ chainId: r.chainId, reason: 'value is not an integer amount' })
      continue
    }
    subtotals[symbol] = (subtotals[symbol] ?? 0n) + amount
  }

  return { subtotals, partial: missing.length > 0, missing }
}

/**
 * A sentence naming what an aggregate is missing, or null when it is complete.
 * Callers render this next to any partial total so "partial" is never just a flag nobody shows.
 */
export function partialLabel(aggregated, nameForChain = (id) => `chain ${id}`) {
  if (!aggregated?.partial) return null
  const names = aggregated.missing.map((m) => nameForChain(m.chainId))
  return `Partial — excludes ${names.join(', ')} (could not be read)`
}
