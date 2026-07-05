// Event-derived timeline for oracle-settled open challenges (spec 041, FR-007/FR-003).
// "The event defines the timelines": the creator never hand-picks dates — the linked
// Polymarket market's end date drives both deadlines, clamped to stay strictly inside
// the contract bounds (WagerRegistryCore: MAX_ACCEPT_WINDOW = 30d, MAX_RESOLVE_WINDOW
// = 180d) so a derived value can never revert _checkDeadlines while the tx is pending.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Markets ending sooner than this are not offered — nobody could realistically share
 *  a code and have it taken in time (parity with the 1v1 oracle flow's 1-hour floor). */
export const MIN_LEAD_MS = HOUR_MS

/** Contract MAX_ACCEPT_WINDOW (30 days) minus a tx-safety margin. */
export const ACCEPT_CAP_MS = 30 * DAY_MS - HOUR_MS

/** Time allowed after the market's scheduled end for Polymarket to resolve and for
 *  anyone to call autoResolveFromPolymarket. */
export const SETTLE_BUFFER_MS = 7 * DAY_MS

/** Contract MAX_RESOLVE_WINDOW (180 days) minus a tx-safety margin. */
export const RESOLVE_CAP_MS = 180 * DAY_MS - HOUR_MS

/**
 * Derive the accept/settle deadlines for an oracle open challenge from the linked
 * market's scheduled end. Pure and clock-injected (callers anchor `nowMs` at mount).
 *
 * Returns:
 *   {
 *     eligible: boolean,
 *     reason: string|null,            // set iff !eligible
 *     acceptDeadlineMs: number|null,  // min(marketEnd, now + ACCEPT_CAP_MS)
 *     resolveDeadlineMs: number|null, // min(marketEnd + SETTLE_BUFFER_MS, now + RESOLVE_CAP_MS)
 *     acceptCapped: boolean,          // the 30-day cap shortened the accept window
 *   }
 *
 * Invariants for every eligible result: now < accept < resolve, accept ≤ now + 30d,
 * resolve ≤ now + 180d (see contracts/timeline-derivation.md).
 */
export function deriveOracleChallengeTimeline(marketEndIso, nowMs = Date.now()) {
  const ineligible = (reason) => ({
    eligible: false,
    reason,
    acceptDeadlineMs: null,
    resolveDeadlineMs: null,
    acceptCapped: false,
  })

  if (!marketEndIso) return ineligible('This market has no scheduled end date.')
  const endMs = Date.parse(marketEndIso)
  if (!Number.isFinite(endMs)) return ineligible('This market has no readable end date.')
  if (endMs < nowMs + MIN_LEAD_MS) {
    return ineligible('This market ends too soon to share a challenge for it.')
  }

  const acceptCapMs = nowMs + ACCEPT_CAP_MS
  const acceptCapped = acceptCapMs < endMs
  const acceptDeadlineMs = acceptCapped ? acceptCapMs : endMs
  // marketEnd ≥ acceptDeadline and the buffer/caps preserve the gap, so
  // resolve > accept holds by construction.
  const resolveDeadlineMs = Math.min(endMs + SETTLE_BUFFER_MS, nowMs + RESOLVE_CAP_MS)

  return { eligible: true, reason: null, acceptDeadlineMs, resolveDeadlineMs, acceptCapped }
}

export default deriveOracleChallengeTimeline
