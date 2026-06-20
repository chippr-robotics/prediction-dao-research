/**
 * deriveTransfersFromWagers — synthesize the member's value movements
 * (deposit / payout / refund) directly from the authoritative wager records
 * that power "My Wagers", instead of the separate `WagerTransfer` subgraph
 * entity (`reportDataSource.listTransfers`).
 *
 * Why: the Account dashboard previously read money flows from a DIFFERENT data
 * path than the wager list and the notification feed. When that entity is only
 * partially indexed the activity feed shows a confusing, incomplete subset of
 * events. Deriving from the same `wagers` array the rest of the app trusts makes
 * the dashboard's totals, P&L, breakdowns, and activity exactly consistent with
 * My Wagers — every time, regardless of WagerTransfer indexing gaps.
 *
 * The amounts are exact, not estimated: payout = creatorStake + opponentStake
 * (WagerRegistry transfers the full pot to the winner with no fee), and each
 * party's refund/draw return is their own stake — mirroring the on-chain
 * lifecycle the subgraph mappings record.
 *
 * Output shape matches `transferDerivation.deriveTransfers` pre-items so the
 * result feeds straight into `enrichTransfers` (token meta + USD valuation).
 * Pure — no I/O. `txHash` is intentionally empty: these are derived from wager
 * state, not a single log, so there is no one transaction to link.
 */
import { normalizeStatus, sameAddress } from './status'

/** Statuses in which the opponent has accepted and therefore staked. */
const OPPONENT_HAS_DEPOSITED = new Set([
  'active',
  'draw_proposed',
  'resolved',
  'refunded',
  'drawn',
])

/** Settled statuses where both parties get their own stake back. */
const MUTUAL_REFUND_STATUSES = new Set(['refunded', 'drawn'])

/** Settled statuses where only the creator ever deposited, so only they refund. */
const CREATOR_ONLY_REFUND_STATUSES = new Set(['cancelled', 'declined'])

function toBigInt(value) {
  try {
    return BigInt(value ?? 0)
  } catch {
    return 0n
  }
}

/**
 * @param {object} params
 * @param {Array}  params.wagers  - rich wagers (creator, opponent, winner, stakes, status, timestamps)
 * @param {string} params.address - the member's wallet address
 * @returns {Array} unenriched transfer pre-items { wagerId, direction, tokenAddress, amountRaw, txHash, timestamp }
 */
export function deriveTransfersFromWagers({ wagers = [], address } = {}) {
  if (!address) return []
  const items = []

  for (const w of wagers) {
    const isCreator = sameAddress(w.creator, address)
    const isOpponent = sameAddress(w.opponent, address)
    if (!isCreator && !isOpponent) continue

    const token = w.stakeTokenAddress || w.token || null
    const status = normalizeStatus(w.status)
    const creatorStake = toBigInt(w.creatorStake ?? w.stakeAmount)
    const opponentStake = toBigInt(w.opponentStake ?? w.stakeAmount)
    const ownStake = isCreator ? creatorStake : opponentStake

    // Timestamps: the creator stakes at creation; we have no separate acceptance
    // time for the opponent, so we attribute their deposit to createdAt too.
    // Settlement uses resolvedAt when present, else createdAt (refund/cancel/
    // decline events don't set resolvedAt in the index).
    const createdAt = Number(w.createdAt) || 0
    const settledAt = Number(w.resolvedAt) || createdAt

    const push = (direction, amount, timestamp) => {
      if (amount <= 0n) return
      items.push({
        wagerId: String(w.id),
        direction,
        tokenAddress: token,
        amountRaw: amount.toString(),
        txHash: '',
        timestamp,
      })
    }

    // ---- Deposits: the member's own stake into escrow ----
    if (isCreator) push('deposit', creatorStake, createdAt)
    if (isOpponent && OPPONENT_HAS_DEPOSITED.has(status)) push('deposit', opponentStake, createdAt)

    // ---- Settlement: value returned to the member ----
    if (status === 'resolved' && sameAddress(w.winner, address)) {
      push('payout', creatorStake + opponentStake, settledAt)
    } else if (MUTUAL_REFUND_STATUSES.has(status)) {
      push('refund', ownStake, settledAt)
    } else if (CREATOR_ONLY_REFUND_STATUSES.has(status) && isCreator) {
      push('refund', creatorStake, settledAt)
    }
  }

  return items
}

export default deriveTransfersFromWagers
