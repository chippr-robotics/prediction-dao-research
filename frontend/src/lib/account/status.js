/**
 * Wager status / outcome helpers for the Account dashboard (spec 020).
 *
 * The subgraph emits lowercase status strings derived from the on-chain
 * `Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }` enum
 * (plus UI-level `draw_proposed`/`declined`). These pure helpers classify a
 * wager into the buckets the dashboard's metrics need. No I/O.
 */

/** Statuses that mean the wager is still live (counts toward Active / at-stake). */
export const ACTIVE_STATUSES = Object.freeze([
  'open',
  'active',
  'draw_proposed',
  'pending',
])

const ACTIVE_SET = new Set(ACTIVE_STATUSES)

/** Normalize a status value to a lowercase string. */
export function normalizeStatus(status) {
  return String(status ?? '').toLowerCase()
}

/** True when the wager is still live (not settled). */
export function isActiveStatus(status) {
  return ACTIVE_SET.has(normalizeStatus(status))
}

/** True when the wager has reached a terminal/settled state. */
export function isSettledStatus(status) {
  const s = normalizeStatus(status)
  return s !== '' && s !== 'none' && !ACTIVE_SET.has(s)
}

/** Case-insensitive address equality (handles null/undefined). */
export function sameAddress(a, b) {
  if (!a || !b) return false
  return String(a).toLowerCase() === String(b).toLowerCase()
}

/**
 * Classify the member's outcome for a wager.
 *
 * @returns {'win'|'loss'|'draw'|null} null when the wager is not decided
 *   (still active) or has no decisive winner (e.g. refunded/cancelled).
 */
export function classifyOutcome(wager, address) {
  if (!wager) return null
  const s = normalizeStatus(wager.status)
  if (s === 'drawn') return 'draw'
  if (s === 'resolved') {
    if (!wager.winner) return null
    return sameAddress(wager.winner, address) ? 'win' : 'loss'
  }
  // open/active/refunded/cancelled/declined → no win/loss contribution
  return null
}
