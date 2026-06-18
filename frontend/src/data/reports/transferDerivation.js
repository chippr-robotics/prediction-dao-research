/**
 * Derive the signed-in user's stablecoin transfers from FriendGroupMarketFactory
 * lifecycle events (spec 016-wager-tax-report, FR-003/FR-006; research.md D2).
 *
 * The deployed/indexed contract is FriendGroupMarketFactory. The four events
 * that move stablecoin value — each carrying its own amount + party — map to
 * transfers involving the user:
 *
 *   MarketCreatedPending → creator's stake deposit   (user → escrow)
 *   ParticipantAccepted  → participant stake deposit (user → escrow)
 *   WinningsClaimed      → winnings payout           (escrow → user)
 *   StakeRefunded        → stake refund              (escrow → user)
 *
 * Only transfers where the user is the party are emitted. Sending/receiving
 * addresses are derived (user ↔ the factory escrow address); the stake token
 * comes from the event when present, else the wager context. Pure module —
 * fee/timestamp/USD are added later by enrichment + valuation.
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
 * @param {object} params.wager - { id, stakeTokenAddress }
 * @param {object[]} params.events - ordered lifecycle events for this wager
 * @param {string} params.userAddress - the report subject
 * @param {string} params.registryAddress - escrow (factory) address
 * @returns {object[]} pre-items (unenriched transfer line items)
 */
export function deriveTransfers({ wager, events, userAddress, registryAddress }) {
  const items = []
  const contextToken = wager?.stakeTokenAddress

  const outbound = (amountRaw, token, ev) => ({
    wagerId: String(wager.id),
    direction: DIRECTION.DEPOSIT,
    tokenAddress: token || contextToken,
    amountRaw: String(amountRaw),
    fromAddress: userAddress,
    toAddress: registryAddress,
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
  })

  const inbound = (direction, amountRaw, token, ev) => ({
    wagerId: String(wager.id),
    direction,
    tokenAddress: token || contextToken,
    amountRaw: String(amountRaw),
    fromAddress: registryAddress,
    toAddress: userAddress,
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
  })

  for (const ev of events || []) {
    const a = ev.args || {}
    switch (ev.name) {
      case 'MarketCreatedPending':
        if (eq(a.creator, userAddress)) {
          items.push(outbound(a.stakePerParticipant, a.stakeToken, ev))
        }
        break
      case 'ParticipantAccepted':
        if (eq(a.participant, userAddress)) {
          items.push(outbound(a.stakedAmount, null, ev))
        }
        break
      case 'WinningsClaimed':
        if (eq(a.winner, userAddress)) {
          items.push(inbound(DIRECTION.PAYOUT, a.amount, a.token, ev))
        }
        break
      case 'StakeRefunded':
        if (eq(a.participant, userAddress)) {
          items.push(inbound(DIRECTION.REFUND, a.amount, null, ev))
        }
        break
      default:
        break
    }
  }
  return items
}
