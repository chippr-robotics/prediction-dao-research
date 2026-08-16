/**
 * Wager display-title helpers — pure functions of a wager record, no React.
 *
 * Promoted here from `components/fairwins/wagerCardHelpers.js` so non-component
 * layers (the account activity ledger annotates wager entries with the wager's
 * message) can share the exact title logic My Wagers renders, without a
 * hooks→components import. `wagerCardHelpers` re-exports both, so component
 * imports are unchanged.
 */

const ZERO_ADDRESS_RE = /^0x0{40}$/i

/**
 * True if and only if a wager is an open challenge (feature 024): created with no named opponent.
 * Named-opponent wagers always have a non-zero opponent at creation, so an absent/zero opponent uniquely
 * identifies an open challenge (until a taker accepts, after which the opponent is bound and this returns false).
 */
export function isOpenChallengeMarket(market) {
  if (!market) return false
  // Match the literal zero address that toWagerShape / the subgraph write for an unaccepted open challenge.
  // Don't treat a merely-missing opponent field as open — that would mislabel wagers from other data paths.
  return typeof market.opponent === 'string' && ZERO_ADDRESS_RE.test(market.opponent)
}

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
    // Open challenges (feature 024) have no bound opponent — named wagers always do at creation — and their
    // code-gated terms aren't decryptable here, so label them honestly as "Open Challenge" not "Private Bet".
    if (isOpenChallengeMarket(market)) return `Open Challenge${stakeInfo ? ` - ${stakeInfo}` : ''}`
    return `Private Bet${stakeInfo ? ` - ${stakeInfo}` : ''}`
  }

  // For prediction markets, use proposalTitle or description
  return market.proposalTitle || market.description || `Market #${market.id}`
}
