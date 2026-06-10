/**
 * Snapshot diff engine for wager activity notifications (spec 012).
 *
 * Compares the persisted WagerSnapshot baseline against freshly polled
 * normalized wagers (toWagerShape output from utils/blockchainService.js,
 * optionally carrying `drawProposedBy` attached by the poll loop's event
 * scan) and emits ActivityEntry items per the catalog in
 * specs/012-wager-notifications/contracts/notification-types.md.
 *
 * Rules implemented here:
 *   - First sight (no prior snapshot) records a snapshot and emits ZERO
 *     entries — fresh storage / a new device never re-announces history.
 *   - A canonical-state change emits the catalog entry for that transition;
 *     unmapped transitions fall back to the factual 'state-changed' entry —
 *     participant-relevant changes are never silent.
 *   - Same-state extras: a winner's `paid` flip yields a 'paid-out' receipt;
 *     draw proposal changes yield 'draw-proposed' / 'draw-revoked'
 *     (independent of state transitions, proposer always excluded).
 *   - Honest finality (constitution III, FR-011): win/claim copy appears only
 *     for the `resolved-claimable` / `resolved-won-paid` winner states; draw
 *     proposals read as provisional.
 *   - Encrypted wagers are labeled "Encrypted Wager #id" — the engine never
 *     attempts decryption (FR / privacy rule in storage-schema.md).
 *
 * Pure: no I/O, no Date.now(), no randomness; time arrives as `nowMs` and
 * inputs are never mutated. All address comparisons lowercase both sides.
 */

import { ORACLE_RESOLUTION_TYPES } from '../../constants/wagerDefaults'
import { canResolve, deriveState } from './derivedState'

/** Canonical states with no further transitions (data-model.md). */
const TERMINAL_STATES = new Set([
  'resolved-claimable',
  'resolved-won-paid',
  'resolved-lost',
  'draw',
  'cancelled',
  'refunded',
])

/** Human labels for the 'state-changed' factual fallback. */
const STATE_LABELS = {
  pending: 'awaiting acceptance',
  expired: 'expired',
  active: 'active',
  resolvable: 'in its resolution window',
  refundable: 'awaiting refund',
  'resolved-claimable': 'resolved',
  'resolved-won-paid': 'settled',
  'resolved-lost': 'resolved',
  draw: 'a draw',
  cancelled: 'cancelled',
  refunded: 'refunded',
}

function lower(s) {
  return s ? String(s).toLowerCase() : ''
}

/** Case-insensitive address equality; false when either side is empty. */
function sameAddress(a, b) {
  const la = lower(a)
  return la !== '' && la === lower(b)
}

/** `0xAbCd…1234` display form (no shared util exists in utils/ yet). */
function shortenAddress(address) {
  const s = String(address || '')
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s
}

/**
 * Display description for messages. Encrypted wagers already arrive with the
 * literal description 'Encrypted Wager' (toWagerShape) — append the id for
 * identification and never attempt decryption. A decrypted-in-session
 * description (caller replaced it) passes through unchanged.
 */
function displayDesc(wager) {
  const d = wager.description
  if (!d) return `Wager #${wager.id}`
  if (wager.isEncrypted && d === 'Encrypted Wager') return `Encrypted Wager #${wager.id}`
  return d
}

/** Numeric stake from a formatted string; 0 when unparseable. */
function toNumber(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/** Amount display: trims trailing zeros and float artifacts ('10.0' → '10'). */
function trimAmount(value) {
  const n = toNumber(value)
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

/** Winner's payout = combined stakes (v2 escrows both sides). */
function payoutAmount(wager) {
  return trimAmount(toNumber(wager.creatorStake) + toNumber(wager.opponentStake))
}

function tokenSymbol(wager) {
  return wager.stakeTokenSymbol || 'tokens'
}

/** Human-readable remaining time ("in 5 hours") from the supplied clock. */
function formatTimeUntil(targetMs, nowMs) {
  const diff = Number(targetMs) - Number(nowMs)
  if (diff <= 0) return 'now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'in under a minute'
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(diff / 3_600_000)
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(diff / 86_400_000)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/** Fallback label: raw status for unrecognized/legacy states, table otherwise. */
function stateLabel(currState, wager) {
  if (currState === 'other') return lower(wager.status) || 'updated'
  return STATE_LABELS[currState] || currState
}

/** Shared 'paid-out' descriptor (reached via transition or same-state flip). */
function paidOutDescriptor(wager) {
  return {
    type: 'paid-out',
    severity: 'success',
    actionable: false,
    message: `Winnings paid for '${displayDesc(wager)}': ${payoutAmount(wager)} ${tokenSymbol(wager)}`,
  }
}

/**
 * Map a canonical-state transition to its catalog entry descriptor
 * ({ type, severity, actionable, message }). Always returns a descriptor —
 * unmapped transitions get the factual 'state-changed' fallback.
 */
function describeTransition(wager, account, prevState, currState, nowMs) {
  const desc = displayDesc(wager)

  // pending → active/resolvable: acceptance landed (possibly in a poll gap).
  if (prevState === 'pending' && (currState === 'active' || currState === 'resolvable')) {
    if (sameAddress(wager.opponent, account)) {
      return {
        type: 'accepted',
        severity: 'info',
        actionable: false,
        message: `You accepted '${desc}' — it's live`,
      }
    }
    return {
      type: 'accepted',
      severity: 'success',
      actionable: false,
      message: `${shortenAddress(wager.opponent)} accepted '${desc}' — it's live`,
    }
  }

  if (prevState === 'pending' && currState === 'expired') {
    if (sameAddress(wager.creator, account)) {
      return {
        type: 'expired',
        severity: 'warning',
        actionable: true,
        message: `'${desc}' expired without acceptance — reclaim your ${trimAmount(wager.creatorStake)} ${tokenSymbol(wager)} stake`,
      }
    }
    return {
      type: 'expired',
      severity: 'info',
      actionable: false,
      message: `'${desc}' expired before you accepted`,
    }
  }

  if (prevState === 'active' && currState === 'resolvable') {
    if (canResolve(wager, account)) {
      return {
        type: 'resolvable',
        severity: 'warning',
        actionable: true,
        message: `'${desc}' is ready to resolve — window closes ${formatTimeUntil(wager.resolveDeadlineTime, nowMs)}`,
      }
    }
    const oracle = ORACLE_RESOLUTION_TYPES.has(Number(wager.resolutionType))
    return {
      type: 'resolvable-waiting',
      severity: 'info',
      actionable: false,
      message: oracle
        ? `'${desc}' is awaiting oracle resolution`
        : `'${desc}' has entered its resolution window`,
    }
  }

  // Honest finality: the only places win/claim copy may appear.
  if (currState === 'resolved-claimable') {
    return {
      type: 'won-claimable',
      severity: 'success',
      actionable: true,
      message: `You won '${desc}'! Claim ${payoutAmount(wager)} ${tokenSymbol(wager)}`,
    }
  }
  if (currState === 'resolved-won-paid') {
    // For a winner, the paid flip IS this transition (claimable → won-paid).
    return paidOutDescriptor(wager)
  }

  if (currState === 'resolved-lost') {
    const winnerDisplay = wager.winner
      ? shortenAddress(wager.winner)
      : shortenAddress(sameAddress(wager.creator, account) ? wager.opponent : wager.creator)
    return {
      type: 'lost',
      severity: 'info',
      actionable: false,
      message: `'${desc}' resolved — ${winnerDisplay} won`,
    }
  }

  if (currState === 'draw') {
    return {
      type: 'draw-settled',
      severity: 'info',
      actionable: false,
      message: `'${desc}' settled as a draw — stakes returned`,
    }
  }

  if ((prevState === 'active' || prevState === 'resolvable') && currState === 'refundable') {
    return {
      type: 'refundable',
      severity: 'warning',
      actionable: true,
      message: `'${desc}' was not resolved in time — claim your refund`,
    }
  }

  if (currState === 'cancelled') {
    return {
      type: 'cancelled',
      severity: 'info',
      actionable: false,
      message: `'${desc}' was cancelled`,
    }
  }

  if (currState === 'refunded') {
    return {
      type: 'refunded',
      severity: 'info',
      actionable: false,
      message: `'${desc}' was refunded — your stake is back`,
    }
  }

  // Factual fallback — never silent for participant-relevant changes.
  return {
    type: 'state-changed',
    severity: 'info',
    actionable: false,
    message: `'${desc}' is now ${stateLabel(currState, wager)}`,
  }
}

/** Materialize an ActivityEntry (data-model.md shape, dedup id `id:type`). */
function makeEntry(wagerId, descriptor, nowMs, idOverride) {
  return {
    id: idOverride || `${wagerId}:${descriptor.type}`,
    type: descriptor.type,
    wagerId,
    message: descriptor.message,
    severity: descriptor.severity,
    actionable: descriptor.actionable,
    createdAt: nowMs,
    read: false,
  }
}

/**
 * Diff the snapshot baseline against the polled wagers.
 *
 * Snapshot carry-forward: wagers absent from this poll keep their previous
 * snapshot untouched (activityStore.pruneSnapshots owns retention), so a
 * partial poll result never causes terminal transitions to be re-announced.
 *
 * `drawProposedBy` semantics on the incoming wager:
 *   - string    → an open proposal by that address (event scan fold)
 *   - null      → explicitly revoked (a DrawRevoked superseded the proposal)
 *   - undefined → no scan information; the previous value carries forward
 * The next snapshot's value is always cleared to null in terminal states.
 *
 * @param {object} params
 * @param {Object<string, object>} params.snapshots - Prior WagerSnapshot map
 * @param {object[]} params.wagers - Normalized wagers (toWagerShape output),
 *   each optionally carrying `drawProposedBy`
 * @param {string|null} params.account - Viewer's wallet address (any casing)
 * @param {number} params.nowMs - Current time in ms (caller-supplied clock)
 * @returns {{entries: object[], nextSnapshots: Object<string, object>}}
 *   New ActivityEntry items (input order) and the replacement snapshot map
 */
export function diffWagers({ snapshots, wagers, account, nowMs }) {
  const prevSnapshots = snapshots || {}
  const now = Number(nowMs)
  const entries = []
  const nextSnapshots = { ...prevSnapshots }

  for (const wager of wagers || []) {
    if (!wager || wager.id === undefined || wager.id === null) continue
    const id = String(wager.id)
    const prev = prevSnapshots[id] || null
    const currState = deriveState(wager, account, now)
    const terminal = TERMINAL_STATES.has(currState)

    const prevDraw = prev ? lower(prev.drawProposedBy) || null : null
    let nextDraw
    if (terminal) {
      nextDraw = null
    } else if (wager.drawProposedBy !== undefined) {
      nextDraw = lower(wager.drawProposedBy) || null
    } else {
      nextDraw = prevDraw
    }

    nextSnapshots[id] = {
      id,
      state: currState,
      status: wager.status ?? null,
      winner: wager.winner ? lower(wager.winner) : null,
      paid: Boolean(wager.paid),
      acceptanceDeadline: wager.acceptanceDeadline,
      resolveDeadlineTime: wager.resolveDeadlineTime,
      tradingEndTime: wager.tradingEndTime,
      drawProposedBy: nextDraw,
      snappedAt: now,
    }

    // First sight: snapshot only, ZERO entries (FR-010 + catalog rule).
    if (!prev) continue

    if (prev.state !== currState) {
      entries.push(makeEntry(id, describeTransition(wager, account, prev.state, currState, now), now))
    } else if (prev.paid === false && Boolean(wager.paid) && sameAddress(wager.winner, account)) {
      // Same-state payout receipt (winner only).
      entries.push(makeEntry(id, paidOutDescriptor(wager), now))
    }

    // Draw proposal extras — independent of state transitions.
    if (!prevDraw && nextDraw && !sameAddress(nextDraw, account)) {
      entries.push(
        makeEntry(
          id,
          {
            type: 'draw-proposed',
            severity: 'warning',
            actionable: true,
            message: `${shortenAddress(nextDraw)} proposed settling '${displayDesc(wager)}' as a draw — accept or decline`,
          },
          now,
          `${id}:drawProposed:${nextDraw}`
        )
      )
    } else if (prevDraw && !nextDraw && !terminal && !sameAddress(prevDraw, account)) {
      entries.push(
        makeEntry(
          id,
          {
            type: 'draw-revoked',
            severity: 'info',
            actionable: false,
            message: `${shortenAddress(prevDraw)} withdrew their draw proposal on '${displayDesc(wager)}'`,
          },
          now
        )
      )
    }
  }

  return { entries, nextSnapshots }
}
