/**
 * Derive the signed-in user's stablecoin transfers from wager lifecycle events
 * (spec 016-wager-tax-report, FR-003/FR-006; research.md D2).
 *
 * Supports both deployed contract generations:
 *   - v2 WagerRegistry (Polygon/Amoy/Hardhat): WagerCreated / WagerAccepted /
 *     PayoutClaimed / WagerRefunded / WagerCancelled / WagerDrawn
 *   - v1 FriendGroupMarketFactory (legacy Mordor): MarketCreatedPending /
 *     ParticipantAccepted / WinningsClaimed / StakeRefunded
 *
 * Each event that moves stablecoin value maps to a transfer involving the user:
 *   deposit  (user → escrow)   — creator/opponent stakes their funds
 *   payout   (escrow → user)   — winner claims winnings
 *   refund   (escrow → user)   — stake returned (refund / cancel / draw)
 *
 * Only transfers where the user is the party are emitted. Sending/receiving
 * addresses are derived (user ↔ the escrow contract). The stake token + amounts
 * come from the events (with the enumerated wager as a fallback). Pure module —
 * fee/timestamp/USD are added later by enrichment + valuation.
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
 * @param {object} params.wager - { id, creator, participants, stakeTokenAddress, stakeAmount }
 * @param {object[]} params.events - ordered lifecycle events for this wager
 * @param {string} params.userAddress - the report subject
 * @param {string} params.registryAddress - escrow contract address
 * @returns {object[]} pre-items (unenriched transfer line items)
 */
export function deriveTransfers({ wager, events, userAddress, registryAddress }) {
  const items = []
  const contextToken = wager?.stakeTokenAddress

  // Capture per-wager stake context from the creation event (v2 WagerCreated
  // carries explicit creator/opponent stakes, which differ under odds).
  let creatorAddr = wager?.creator
  let opponentAddr = null
  let creatorStake = wager?.stakeAmount
  let opponentStake = wager?.stakeAmount
  let createdToken = contextToken
  for (const ev of events || []) {
    if (ev.name === 'WagerCreated') {
      const a = ev.args || {}
      creatorAddr = a.creator ?? creatorAddr
      opponentAddr = a.opponent ?? opponentAddr
      creatorStake = a.creatorStake ?? creatorStake
      opponentStake = a.opponentStake ?? opponentStake
      createdToken = a.token ?? createdToken
    }
  }
  const token = createdToken || contextToken

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

  // The user's own stake (creator vs opponent side) for refund/draw amounts.
  const ownStake = () => (eq(creatorAddr, userAddress) ? creatorStake : opponentStake)

  for (const ev of events || []) {
    const a = ev.args || {}
    switch (ev.name) {
      // ---- v2 WagerRegistry ----
      case 'WagerCreated':
        if (eq(a.creator, userAddress)) items.push(deposit(a.creatorStake ?? creatorStake, ev))
        break
      case 'WagerAccepted':
        if (eq(a.opponent, userAddress)) items.push(deposit(opponentStake, ev))
        break
      case 'PayoutClaimed':
        if (eq(a.winner, userAddress)) items.push(inbound(DIRECTION.PAYOUT, a.amount, ev))
        break
      case 'WagerRefunded':
      case 'WagerDrawn':
        if (eq(a.creator, userAddress) || eq(a.opponent, userAddress) ||
            eq(creatorAddr, userAddress) || eq(opponentAddr, userAddress)) {
          items.push(inbound(DIRECTION.REFUND, ownStake(), ev))
        }
        break
      case 'WagerCancelled':
        if (eq(creatorAddr, userAddress)) items.push(inbound(DIRECTION.REFUND, creatorStake, ev))
        break

      // ---- v1 FriendGroupMarketFactory (legacy Mordor) ----
      case 'MarketCreatedPending':
        if (eq(a.creator, userAddress)) {
          items.push(deposit(a.stakePerParticipant ?? creatorStake, { ...ev }))
        }
        break
      case 'ParticipantAccepted':
        if (eq(a.participant, userAddress)) items.push(deposit(a.stakedAmount, ev))
        break
      case 'WinningsClaimed':
        if (eq(a.winner, userAddress)) items.push(inbound(DIRECTION.PAYOUT, a.amount, ev))
        break
      case 'StakeRefunded':
        if (eq(a.participant, userAddress)) items.push(inbound(DIRECTION.REFUND, a.amount, ev))
        break

      default:
        break
    }
  }
  return items
}
