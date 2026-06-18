/**
 * Derive the signed-in user's stablecoin transfers from wager lifecycle events
 * (spec 016-wager-tax-report, FR-003/FR-006; research.md D2).
 *
 * Each lifecycle event maps to zero or more transfers involving the user:
 *   WagerCreated   → creator's stake deposit   (user → escrow)
 *   WagerAccepted  → opponent's stake deposit  (user → escrow)
 *   PayoutClaimed  → winner payout             (escrow → user)
 *   WagerRefunded  → stake refund              (escrow → user)
 *   WagerCancelled → creator refund            (escrow → user)
 *   WagerDrawn     → stake returned            (escrow → user)
 *
 * Only transfers where the user is a party are emitted. Sending/receiving
 * addresses are derived (user ↔ the WagerRegistry escrow); no per-transfer
 * address data is needed from any index. Pure module — fee/timestamp/USD are
 * added later by enrichment + valuation.
 *
 * Output "pre-item" shape (per transfer):
 *   { wagerId, direction, tokenAddress, amountRaw, fromAddress, toAddress,
 *     txHash, blockNumber }
 */

export const DIRECTION = Object.freeze({
  DEPOSIT: 'deposit',
  PAYOUT: 'payout',
  REFUND: 'refund',
})

function eq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase()
}

/**
 * @param {object} params
 * @param {object} params.wager - { id, stakeTokenAddress, stakeAmount }
 * @param {object[]} params.events - ordered lifecycle events for this wager
 * @param {string} params.userAddress - the report subject
 * @param {string} params.registryAddress - escrow (WagerRegistry) address
 * @returns {object[]} pre-items (unenriched transfer line items)
 */
export function deriveTransfers({ wager, events, userAddress, registryAddress }) {
  const items = []
  const token = wager?.stakeTokenAddress
  const stake = wager?.stakeAmount

  const deposit = (amountRaw, ev) => ({
    wagerId: String(wager.id),
    direction: DIRECTION.DEPOSIT,
    tokenAddress: token,
    amountRaw: String(amountRaw),
    fromAddress: userAddress,
    toAddress: registryAddress,
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
  })

  const inbound = (direction, amountRaw, ev) => ({
    wagerId: String(wager.id),
    direction,
    tokenAddress: token,
    amountRaw: String(amountRaw),
    fromAddress: registryAddress,
    toAddress: userAddress,
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
  })

  for (const ev of events || []) {
    const a = ev.args || {}
    switch (ev.name) {
      case 'WagerCreated':
        if (eq(a.creator, userAddress)) {
          items.push(deposit(a.creatorStake ?? stake, ev))
        }
        break
      case 'WagerAccepted':
        if (eq(a.opponent, userAddress)) {
          items.push(deposit(stake, ev))
        }
        break
      case 'PayoutClaimed':
        if (eq(a.winner, userAddress)) {
          items.push(inbound(DIRECTION.PAYOUT, a.amount ?? stake, ev))
        }
        break
      case 'WagerRefunded':
      case 'WagerDrawn':
        if (eq(a.creator, userAddress) || eq(a.opponent, userAddress)) {
          items.push(inbound(DIRECTION.REFUND, stake, ev))
        }
        break
      case 'WagerCancelled':
        if (eq(wager.creator, userAddress)) {
          items.push(inbound(DIRECTION.REFUND, stake, ev))
        }
        break
      default:
        break
    }
  }
  return items
}
