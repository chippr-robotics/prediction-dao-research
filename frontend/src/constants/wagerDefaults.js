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

  /** Default stake token id — the chain stablecoin (USDC on Polygon Amoy). */
  STAKE_TOKEN_ID: 'STABLE',

  /** Max allowed stake amount (used in validation) */
  MAX_STAKE: 1000,

  /** Default small-group member limit (string for form input) */
  MEMBER_LIMIT: '5',

  /** Minimum participants required to activate a market (including creator) */
  MIN_ACCEPTANCE_THRESHOLD: 2,

  /** Odds multiplier for equal-stake wagers (200 = 2×, 100 basis points) */
  ODDS_MULTIPLIER: 200,

  /** Default resolution type: 0=Either, 1=Initiator, 2=Receiver, 3=ThirdParty, 5=PolymarketOracle (linked market) */
  RESOLUTION_TYPE: 0,

  /** Default trading / wager duration in days */
  WAGER_END_DAYS: 1,

  /** Default acceptance deadline in hours */
  ACCEPTANCE_DEADLINE_HOURS: 6,

  /** Default trading period fallback in days (for chain submission) */
  TRADING_PERIOD_DAYS: 1,

  /**
   * Minimum trading period in seconds. Mirrors
   * ConditionalMarketFactory.MIN_TRADING_PERIOD — 1 hour is past Polygon /
   * Ethereum finality (~10 min), so resolutions can't be unwound by a reorg.
   */
  MIN_TRADING_PERIOD_SECONDS: 60 * 60,

  /** Maximum trading period in seconds (mirrors contract MAX_TRADING_PERIOD). */
  MAX_TRADING_PERIOD_SECONDS: 21 * 24 * 60 * 60,
}

// ── Wager status strings (friend / P2P markets) ────────────────────
export const WagerStatus = {
  PENDING_ACCEPTANCE: 'pending_acceptance',
  ACTIVE: 'active',
  PENDING_RESOLUTION: 'pending_resolution',
  CHALLENGED: 'challenged',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  ORACLE_TIMED_OUT: 'oracle_timed_out',
}

// ── Dispute status strings ──────────────────────────────────────────
export const DisputeStatus = {
  NONE: 'none',
  OPENED: 'opened',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
}

// ── Resolution types (on-chain enum) ────────────────────────────────
// Mirrors `enum ResolutionType` in contracts/interfaces/IWagerRegistry.sol.
// Keep in lock-step with the contract — value ordering is wire-stable.
export const ResolutionType = {
  Either: 0,
  Creator: 1,
  Opponent: 2,
  ThirdParty: 3,
  Polymarket: 4,
  ChainlinkDataFeed: 5,
  ChainlinkFunctions: 6,
  UMA: 7,
}

// Resolution types that require an `oracleConditionId` to be passed to
// WagerRegistry.createWager (called `polymarketConditionId` on-chain for
// legacy naming). Anything in this set needs a pre-registered conditionId
// on the corresponding adapter.
export const ORACLE_RESOLUTION_TYPES = new Set([
  ResolutionType.Polymarket,
  ResolutionType.ChainlinkDataFeed,
  ResolutionType.ChainlinkFunctions,
  ResolutionType.UMA,
])

export const ResolutionTypeNames = {
  0: 'Either',
  1: 'Creator',
  2: 'Opponent',
  3: 'Third Party',
  4: 'Polymarket',
  5: 'Chainlink Data Feed',
  6: 'Chainlink Functions',
  7: 'UMA Optimistic Oracle',
}

// Sort order for "Resolution type" grouping in My Wagers. Mirrors enum order.
export const ResolutionTypeOrder = [0, 1, 2, 3, 4, 5, 6, 7]

// ── Sort keys for My Wagers list ────────────────────────────────────
export const WagerSortKey = {
  CREATED: 'createdAt',
  ENDS: 'endTime',
  RESOLUTION_TYPE: 'resolutionType',
  STATUS: 'status',
}

// Terminal statuses — wagers in these states are considered "history"
export const TERMINAL_STATUSES = new Set([
  'resolved',
  'cancelled',
  'refunded',
  'oracle_timed_out',
])

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

/**
 * Returns an ISO datetime-local string set to the midpoint between
 * the current wall-clock time and the given end time.
 * Falls back to the fixed-hour default when endDateTime is missing or invalid.
 */
export const getMidpointAcceptanceDeadline = (endDateTime) => {
  if (!endDateTime) return getDefaultAcceptanceDeadline()
  const now = Date.now()
  const end = new Date(endDateTime).getTime()
  if (Number.isNaN(end) || end <= now) return getDefaultAcceptanceDeadline()
  const midpoint = now + (end - now) / 2
  return new Date(midpoint).toISOString().slice(0, 16)
}

/**
 * Convert any datetime-like value into the `<input type="datetime-local">`
 * string format (`YYYY-MM-DDTHH:mm`) in the user's local timezone.
 * Used when seeding the end-date field from a linked Polymarket's endDate.
 */
export const toDateTimeLocal = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
