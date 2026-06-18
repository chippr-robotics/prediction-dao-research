import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'

/**
 * Shared, presentation-only helpers for the My Wagers views (spec 017).
 *
 * Extracted from MyMarketsModal so the card grid (WagerCardGrid / WagerCard) and
 * the modal can share the same display logic without a circular import. These are
 * pure functions of their inputs — no React, no side effects.
 */

/**
 * Display title for a wager, handling encrypted/private placeholders.
 */
export function getMarketDisplayTitle(market) {
  // Check decrypted metadata (from useLazyMarketDecryption hook)
  if (market.decryptedMetadata) {
    const title = market.decryptedMetadata.name || market.decryptedMetadata.description || market.decryptedMetadata.question
    if (title) return title
  }

  if (market.metadata && market.canView !== false) {
    const title = market.metadata.name || market.metadata.description || market.metadata.question
    if (title && title !== 'Private Market' && title !== 'Private Wager' && title !== 'Encrypted Market' && title !== 'Encrypted Wager') {
      return title
    }
  }

  // For friend markets, use description field
  if (market.marketType === 'friend') {
    const desc = market.description
    // Skip placeholder values
    if (desc && desc !== 'Encrypted Market' && desc !== 'Encrypted Wager' && desc !== 'Private Market' && desc !== 'Private Wager') {
      return desc
    }
    // If encrypted/private, show stake and time info
    const stakeInfo = market.stakeAmount ? `${market.stakeAmount} ${market.stakeTokenSymbol || 'ETC'}` : ''
    return `Private Bet${stakeInfo ? ` - ${stakeInfo}` : ''}`
  }

  // For prediction markets, use proposalTitle or description
  return market.proposalTitle || market.description || `Market #${market.id}`
}

/**
 * Human-readable outcome for a terminal wager row in the History tab.
 *
 *   - resolved + you won              → "Won"   (positive)
 *   - resolved + you staked and lost  → "Lost"  (negative)
 *   - resolved + you only arbitrated  → winner's short address (neutral)
 *   - draw / refunded / cancelled / … → that status (neutral)
 */
export function getRowOutcome(market, account) {
  const status = market.computedStatus
  if (status === MarketStatus.DRAW) return { label: 'Draw', tone: 'neutral' }
  if (status === MarketStatus.REFUNDED) return { label: 'Refunded', tone: 'neutral' }
  if (status === MarketStatus.CANCELLED) return { label: 'Cancelled', tone: 'neutral' }
  if (status === MarketStatus.DECLINED) return { label: 'Declined', tone: 'neutral' }
  if (status === MarketStatus.ORACLE_TIMED_OUT) return { label: 'Timed Out', tone: 'neutral' }

  if (status === MarketStatus.RESOLVED) {
    const userAddr = account?.toLowerCase()
    const winner = market.winner?.toLowerCase?.()
    if (userAddr && winner) {
      if (winner === userAddr) return { label: 'Won', tone: 'positive' }
      const isCreator = market.creator?.toLowerCase() === userAddr
      const isParticipant = market.participants?.some(p => p?.toLowerCase() === userAddr)
      if (isCreator || isParticipant) return { label: 'Lost', tone: 'negative' }
    }
    if (market.winner) {
      return { label: `${market.winner.slice(0, 6)}…${market.winner.slice(-4)}`, tone: 'neutral' }
    }
    return { label: 'Resolved', tone: 'neutral' }
  }

  // Non-terminal or unknown: fall back to any explicit outcome the data carries.
  if (market.outcome) {
    const positive = market.outcome === 'Pass' || market.outcome === 'Yes' || market.outcome === 'Won'
    return { label: market.outcome, tone: positive ? 'positive' : 'negative' }
  }
  return { label: 'N/A', tone: 'neutral' }
}

/**
 * True when `account` is the declared winner of a resolved wager whose payout
 * has not yet been pulled — i.e. the viewer can call claimPayout to collect.
 */
export function isWinnerUnpaid(market, account) {
  if (!market || !account) return false
  if (String(market.status).toLowerCase() !== 'resolved') return false
  if (market.paid) return false
  return market.winner != null &&
    market.winner.toLowerCase() === account.toLowerCase()
}

/** Short 0x1234…ABCD form of an address; passthrough for non-addresses. */
export function formatShortAddress(address) {
  if (!address) return '—'
  if (typeof address !== 'string' || !address.startsWith('0x') || address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
