/**
 * Pure canonical-state + action-needed derivation for wager notifications.
 *
 * Projects a normalized wager (the `toWagerShape` output from
 * utils/blockchainService.js), the viewer's account, and a caller-supplied
 * clock into the CanonicalState / ActionNeeded tables defined in
 * specs/012-wager-notifications/data-model.md.
 *
 * The chain is the source of truth — everything here is a re-derivable
 * projection, so these functions must stay pure: no I/O, no Date.now(), no
 * randomness. Time always arrives as `nowMs` so the diff engine, the
 * provider, and tests share one deterministic clock.
 *
 * All address comparisons lowercase both sides (mixed-case checksummed
 * addresses vs lowercased storage keys are a recurring source of bugs).
 */

import { ResolutionType } from '../../constants/wagerDefaults'

function lower(s) {
  return s ? String(s).toLowerCase() : ''
}

/** Case-insensitive address equality; false when either side is empty. */
function sameAddress(a, b) {
  const la = lower(a)
  return la !== '' && la === lower(b)
}

/**
 * Derive the canonical lifecycle state of a wager from the viewer's
 * perspective at a given instant.
 *
 * Boundary semantics (per the data-model table):
 *   - `now === acceptanceDeadline`  → still `pending`     (now ≤ deadline)
 *   - `now === tradingEndTime`      → `resolvable`        (active is now < end)
 *   - `now === resolveDeadlineTime` → still `resolvable`  (now ≤ deadline)
 *
 * Unknown or legacy v1 statuses (e.g. `pending_acceptance`, `challenged`,
 * `oracle_timed_out`) map to `other` — downstream copy stays factual.
 *
 * @param {object} wager - Normalized wager (toWagerShape output)
 * @param {string|null} account - Viewer's wallet address (any casing)
 * @param {number} nowMs - Current time in ms (caller-supplied clock)
 * @returns {'pending'|'expired'|'active'|'resolvable'|'refundable'|
 *           'resolved-claimable'|'resolved-won-paid'|'resolved-lost'|
 *           'draw'|'cancelled'|'refunded'|'other'} CanonicalState
 */
export function deriveState(wager, account, nowMs) {
  if (!wager) return 'other'
  const status = lower(wager.status)
  const now = Number(nowMs)

  switch (status) {
    case 'pending':
      return now <= Number(wager.acceptanceDeadline) ? 'pending' : 'expired'
    case 'active': {
      if (now < Number(wager.tradingEndTime)) return 'active'
      if (now <= Number(wager.resolveDeadlineTime)) return 'resolvable'
      return 'refundable'
    }
    case 'resolved': {
      if (sameAddress(wager.winner, account)) {
        return wager.paid ? 'resolved-won-paid' : 'resolved-claimable'
      }
      return 'resolved-lost'
    }
    case 'draw':
      return 'draw'
    case 'cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return 'other'
  }
}

/**
 * Whether `account` may call resolve on this wager, per its resolutionType:
 *   Either (0)     → creator or opponent
 *   Creator (1)    → creator only
 *   Opponent (2)   → opponent only
 *   ThirdParty (3) → false (arbitrator resolves via its own flow)
 *   Oracle types (4–7: Polymarket / Chainlink / UMA) → false
 *     (oracles auto-resolve; participants never resolve these)
 *
 * @param {object} wager - Normalized wager
 * @param {string|null} account - Viewer's wallet address (any casing)
 * @returns {boolean}
 */
export function canResolve(wager, account) {
  if (!wager || !account) return false
  switch (Number(wager.resolutionType)) {
    case ResolutionType.Either:
      return sameAddress(wager.creator, account) || sameAddress(wager.opponent, account)
    case ResolutionType.Creator:
      return sameAddress(wager.creator, account)
    case ResolutionType.Opponent:
      return sameAddress(wager.opponent, account)
    default:
      return false
  }
}

/**
 * Derive the single action (if any) `account` should take on this wager.
 * Runtime-only — never persisted, so badges survive cleared storage and new
 * devices (FR-012).
 *
 * Rules (data-model ActionNeeded table):
 *   accept      — state `pending` and account is the opponent
 *   resolve     — state `resolvable` and `canResolve(wager, account)`
 *   claim       — state `resolved-claimable`
 *   refund      — state `expired` and account is the creator (only the
 *                 creator escrowed pre-acceptance), OR state `refundable`
 *                 and account is either participant
 *   respondDraw — a counterparty draw proposal is open and the wager is
 *                 still `active`/`resolvable` (the proposer is excluded)
 *
 * When several rules match, the single highest-priority action is returned:
 * claim > respondDraw > resolve > refund > accept.
 *
 * @param {object} wager - Normalized wager
 * @param {string|null} account - Viewer's wallet address (any casing)
 * @param {number} nowMs - Current time in ms (caller-supplied clock)
 * @param {string|null} [drawProposedBy] - Open draw proposer (from event scan)
 * @returns {'accept'|'resolve'|'claim'|'refund'|'respondDraw'|null} ActionKind
 */
export function deriveActionNeeded(wager, account, nowMs, drawProposedBy = null) {
  if (!wager || !account) return null
  const state = deriveState(wager, account, nowMs)

  if (state === 'resolved-claimable') return 'claim'

  const counterpartyProposedDraw =
    lower(drawProposedBy) !== '' && !sameAddress(drawProposedBy, account)
  if (counterpartyProposedDraw && (state === 'active' || state === 'resolvable')) {
    return 'respondDraw'
  }

  if (state === 'resolvable' && canResolve(wager, account)) return 'resolve'

  const isCreator = sameAddress(wager.creator, account)
  if (state === 'expired' && isCreator) return 'refund'
  if (state === 'refundable' && (isCreator || sameAddress(wager.opponent, account))) {
    return 'refund'
  }

  if (state === 'pending' && sameAddress(wager.opponent, account)) return 'accept'

  return null
}
