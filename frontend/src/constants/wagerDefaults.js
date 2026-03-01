/**
 * Wager Defaults — Single source of truth
 *
 * All default values for P2P wager creation, acceptance, and display
 * are defined here so that Dashboard, FriendMarketsModal, MyMarketsModal,
 * WalletButton, useFriendMarketCreation, blockchainService, and
 * MarketAcceptancePage stay in sync.
 */

// ── Form defaults ───────────────────────────────────────────────────
export const WAGER_DEFAULTS = {
  /** Default stake amount (string, token units) */
  STAKE_AMOUNT: '10',

  /** Default stake token id */
  STAKE_TOKEN_ID: 'USC',

  /** Max allowed stake amount (used in validation) */
  MAX_STAKE: 1000,

  /** Default small-group member limit (string for form input) */
  MEMBER_LIMIT: '5',

  /** Minimum participants required to activate a market (including creator) */
  MIN_ACCEPTANCE_THRESHOLD: 2,

  /** Odds multiplier for equal-stake wagers (200 = 2×, 100 basis points) */
  ODDS_MULTIPLIER: 200,

  /** Default resolution type: 0=Either, 1=Initiator, 2=Receiver, 3=ThirdParty, 4=AutoPegged */
  RESOLUTION_TYPE: 0,

  /** Default trading / wager duration in days */
  WAGER_END_DAYS: 7,

  /** Default acceptance deadline in hours */
  ACCEPTANCE_DEADLINE_HOURS: 48,

  /** Default trading period fallback in days (for chain submission) */
  TRADING_PERIOD_DAYS: 7,
}

// ── Wager status strings (friend / P2P markets) ────────────────────
export const WagerStatus = {
  PENDING_ACCEPTANCE: 'pending_acceptance',
  ACTIVE: 'active',
  PENDING_RESOLUTION: 'pending_resolution',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
}

// ── Dispute status strings ──────────────────────────────────────────
export const DisputeStatus = {
  NONE: 'none',
  OPENED: 'opened',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
}

// ── Oracle source definitions ───────────────────────────────────────
export const ORACLE_SOURCES = [
  { id: 'polymarket', name: 'Polymarket', description: 'Peg wagers to Polymarket event outcomes', icon: '\uD83C\uDFAF' },
  { id: 'chainlink',  name: 'Chainlink',  description: 'Price feed-based resolution',            icon: '\uD83D\uDD17' },
  { id: 'uma',        name: 'UMA',        description: 'Custom truth assertions',                icon: '\u2696\uFE0F' },
  { id: 'manual',     name: 'Manual',     description: 'Creator-resolved with challenge period',  icon: '\u270B' },
]

// ── Date helpers ────────────────────────────────────────────────────
/** Returns an ISO datetime-local string N days from now */
export const getDefaultEndDateTime = (days = WAGER_DEFAULTS.WAGER_END_DAYS) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 16)
}

/** Returns an ISO datetime-local string N hours from now */
export const getDefaultAcceptanceDeadline = (hours = WAGER_DEFAULTS.ACCEPTANCE_DEADLINE_HOURS) => {
  const date = new Date()
  date.setHours(date.getHours() + hours)
  return date.toISOString().slice(0, 16)
}
