/**
 * Perps smart defaults (spec 083, T017) — the pre-selection that makes SC-006 true: a member
 * opening a position changes at most TWO fields (normally amount and leverage) and everything else
 * is already right.
 *
 * Every default here is derived from something real — the venues' live terms, the member's actual
 * holdings, the position's own liquidation bound. Nothing is invented to fill a gap: when the
 * inputs do not support a default, these return `null` and the sheet asks the member instead of
 * pre-filling a number nobody stands behind (constitution III). A fabricated default is worse than
 * an empty field, because a member reasonably reads a pre-filled value as a recommendation.
 *
 * TOTALITY: like `format.js` and `validation.js`, these run during render (the sheet computes its
 * defaults while it paints) — junk in, `null` out, never a throw.
 */
import { PERP_VENUES, isEvmPerpVenue } from '../../config/perps'
import { GAINS_DEFAULT_CLOSING_SLIPPAGE_P } from './venues/gains'

/* ------------------------------------------------------------------------------------------- *
 * Venue choice
 * ------------------------------------------------------------------------------------------- */

/**
 * Venue states that permit OPENING: `venueStatus.js`'s `VENUE_STATUS.OPEN`, plus the venue's own
 * raw ACTIVATED vocabulary for a caller passing a `getTradingActivated()` reading straight through.
 * Everything else is excluded — CLOSE_ONLY in particular looks healthy on every other read and
 * would quietly hand the member an order the venue refuses (FR-017). The set is an allowlist so a
 * status this build has never heard of fails closed, matching `venueStatus.canOpen`.
 */
const OPENABLE_STATUSES = new Set(['activated', 'active', 'open'])

/**
 * Funding differences below what the UI can render (`formatFundingPct` shows 4 decimals of a
 * percent = 1e-6 as a fraction) must not decide the venue: the member would see two identical
 * rates and an unexplainable choice between them.
 */
const FUNDING_EPSILON = 1e-6

/** Open interest wobbles constantly; only a decisively deeper book is a reason worth stating. */
const LIQUIDITY_MARGIN = 0.1

/**
 * Choose the venue to open a pair on, with a SHORT reason the sheet shows next to the venue name.
 *
 * Eligibility is strict and comes first: the venue must be EVM-manageable (Hyperliquid stays
 * read-only this release, FR-021 — excluding it by the config's own `evm` flag rather than by name
 * means it cannot be re-admitted by accident), must be positively open for business, and must
 * actually list the pair. A venue whose status we could not read is NOT eligible: silence is not
 * evidence that it is open.
 *
 * @param pairSymbol      e.g. 'BTC/USD'
 * @param venueSnapshots  array (or venue-keyed object) of `{ venue, status|canOpen, pairs[] }`,
 *                        where each pair row is the normalized shape the gateway serves
 *                        (`symbol`, `fundingRate`, `openInterestUsd`, `maxLeverage`)
 * @param isLong          direction, when known — funding is a COST to one side and income to the
 *                        other, so "better funding" has no meaning without it
 * @returns `{ venue, reason }` — `venue` is null when nothing is eligible, and `reason` still
 *          explains why rather than leaving the UI to guess.
 */
export function pickVenue(pairSymbol, venueSnapshots, options) {
  try {
    // Options destructured inside the guard: a parameter-list destructure throws on an explicit
    // `null`, and this runs while the sheet paints.
    const { isLong } = options ?? {}
    const symbol = normalizeSymbol(pairSymbol)
    if (!symbol) return { venue: null, reason: 'No market selected' }

    const candidates = []
    for (const snapshot of toSnapshotList(venueSnapshots)) {
      const id = String(snapshot?.venue ?? snapshot?.id ?? '').trim()
      if (!PERP_VENUES[id] || !isEvmPerpVenue(id)) continue
      if (!canOpenOn(snapshot)) continue
      const pair = findPair(snapshot, symbol)
      if (!pair) continue
      candidates.push({
        id,
        label: PERP_VENUES[id].shortLabel || PERP_VENUES[id].label || id,
        fundingCost: fundingCostFor(pair.fundingRate, isLong),
        liquidity: finitePositive(pair.openInterestUsd),
      })
    }

    if (candidates.length === 0) {
      return { venue: null, reason: `No venue is open for ${symbol} right now` }
    }
    if (candidates.length === 1) {
      return { venue: candidates[0].id, reason: `Only venue trading ${symbol} right now` }
    }

    // Stable sort: input order is the tie-break, so an unexplainable difference never reorders the
    // list between two renders of the same data.
    const ranked = candidates.map((c, i) => ({ ...c, seq: i })).sort(compareVenues)
    const [best, runnerUp] = ranked

    if (
      best.fundingCost !== null &&
      runnerUp.fundingCost !== null &&
      runnerUp.fundingCost - best.fundingCost > FUNDING_EPSILON
    ) {
      return { venue: best.id, reason: `Cheaper funding than ${runnerUp.label}` }
    }
    if (best.liquidity !== null && runnerUp.liquidity !== null && best.liquidity > runnerUp.liquidity * (1 + LIQUIDITY_MARGIN)) {
      return { venue: best.id, reason: `Deeper liquidity than ${runnerUp.label}` }
    }
    return { venue: best.id, reason: `Similar terms to ${runnerUp.label}` }
  } catch {
    return { venue: null, reason: 'Venue availability could not be read' }
  }
}

function compareVenues(a, b) {
  const funding = compareNullable(a.fundingCost, b.fundingCost, FUNDING_EPSILON, 'asc')
  if (funding !== 0) return funding
  const liquidity = compareNullable(a.liquidity, b.liquidity, 0, 'desc')
  if (liquidity !== 0) return liquidity
  return a.seq - b.seq
}

/** A known value always beats an unknown one — ranking on a number we do not have is a guess. */
function compareNullable(a, b, epsilon, direction) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  // `<=` so that equal values tie at epsilon 0; a comparator that never returns 0 for equals makes
  // the sort order depend on the engine rather than on the input order we promised as the tie-break.
  if (Math.abs(a - b) <= epsilon) return 0
  const asc = a < b ? -1 : 1
  return direction === 'asc' ? asc : -asc
}

/**
 * Funding as a COST to the side being opened: a long pays a positive rate, a short receives it.
 * With the direction unknown, the honest proxy is the magnitude — whichever venue's funding is
 * closest to flat is cheapest on average, and we do not pretend to know which way it helps.
 */
function fundingCostFor(rate, isLong) {
  const r = finite(rate)
  if (r === null) return null
  if (isLong === true) return r
  if (isLong === false) return -r
  return Math.abs(r)
}

/** Positively open. `canOpen` is the explicit answer; otherwise the venue's own trading state. */
function canOpenOn(snapshot) {
  if (snapshot?.canOpen === true) return true
  if (snapshot?.canOpen === false) return false
  const status = String(snapshot?.status ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return OPENABLE_STATUSES.has(status)
}

function toSnapshotList(venueSnapshots) {
  if (Array.isArray(venueSnapshots)) return venueSnapshots
  if (venueSnapshots && typeof venueSnapshots === 'object') {
    return Object.entries(venueSnapshots).map(([id, snapshot]) =>
      snapshot && typeof snapshot === 'object' ? { venue: snapshot.venue ?? id, ...snapshot } : null,
    )
  }
  return []
}

function findPair(snapshot, symbol) {
  const rows = Array.isArray(snapshot?.pairs) ? snapshot.pairs : snapshot?.pair ? [snapshot.pair] : []
  return rows.find((row) => normalizeSymbol(row?.symbol) === symbol) ?? null
}

function normalizeSymbol(value) {
  if (typeof value !== 'string') return null
  const s = value.trim().toUpperCase().replace(/\s+/g, '')
  return s === '' ? null : s
}

/* ------------------------------------------------------------------------------------------- *
 * Leverage
 * ------------------------------------------------------------------------------------------- */

export const CONSERVATIVE_LEVERAGE = 2

/**
 * The default multiplier. 2x is deliberately far below every venue maximum (Gains lists up to
 * 150x): at 2x the market has to move ~50% against the member before liquidation, which is the
 * only default we can defend without knowing their intent. Leverage is expected to be one of the
 * two fields a member changes (SC-006) — a default that is exciting rather than survivable would
 * be a recommendation we have no basis for making.
 *
 * @param venueMaxLeverage the venue's published maximum for this market
 * @param minLeverage      the venue's minimum, where it publishes one (Gains' forex groups start
 *                         above 1x, and a default below the floor would be refused at signing)
 * @returns a plain multiplier, or null when the venue's ceiling is unknown — an unpublished
 *          maximum means we cannot confirm 2x is even allowed.
 */
export function defaultLeverage(venueMaxLeverage, options) {
  try {
    const { minLeverage } = options ?? {}
    const max = finitePositive(venueMaxLeverage)
    if (max === null) return null
    const min = finitePositive(minLeverage) ?? 1
    if (min > max) return null // the venue's own bounds contradict each other — do not invent one
    return Math.min(Math.max(CONSERVATIVE_LEVERAGE, min), max)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Collateral
 * ------------------------------------------------------------------------------------------- */

/**
 * Preferred stablecoins, best first. The member's collateral should be the boring one they already
 * think of as dollars; a venue that also accepts a volatile collateral must never default to it,
 * because that silently adds a second directional bet to a leveraged position.
 */
const PREFERRED_COLLATERAL = ['USDC', 'USDC.E', 'USDCE', 'USDT', 'DAI']

/**
 * Pick the collateral to open with from what the member ACTUALLY HOLDS, intersected with what the
 * venue accepts. A default the member does not hold is not a default — it is a dead form that
 * fails validation the moment they type an amount.
 *
 * @param holdings         `[{ symbol, address?, balance, decimals?, usdValue? }]` from the portfolio
 * @param venueCollaterals `[{ symbol, address?, decimals?, collateralIndex?, isPrimary? }]` — Gains'
 *                         `getCollaterals()` set, or GMX's accepted collateral tokens
 * @returns the venue collateral entry augmented with the member's balance, or null when they hold
 *          none of them.
 */
export function defaultCollateral(holdings, venueCollaterals) {
  try {
    const held = Array.isArray(holdings) ? holdings : []
    const accepted = Array.isArray(venueCollaterals) ? venueCollaterals : []
    if (held.length === 0 || accepted.length === 0) return null

    const byAddress = new Map()
    const bySymbol = new Map()
    for (const h of held) {
      if (!h || typeof h !== 'object' || !hasPositiveBalance(h.balance)) continue
      const addr = typeof h.address === 'string' ? h.address.trim().toLowerCase() : null
      if (addr) byAddress.set(addr, h)
      const sym = normalizeSymbol(h.symbol)
      // Address is the identity; symbol is the fallback, so it must never overwrite a real match.
      if (sym && !bySymbol.has(sym)) bySymbol.set(sym, h)
    }

    const matches = []
    for (const collateral of accepted) {
      if (!collateral || typeof collateral !== 'object') continue
      const addr = typeof collateral.address === 'string' ? collateral.address.trim().toLowerCase() : null
      const sym = normalizeSymbol(collateral.symbol)
      let holding = addr ? (byAddress.get(addr) ?? null) : null
      if (!holding && sym) {
        const bySym = bySymbol.get(sym) ?? null
        // The symbol fallback must never CONTRADICT a published address: a token with the venue
        // collateral's ticker and a different address is a different token, and defaulting to it
        // would put the member's balance behind an approval the venue does not accept.
        if (bySym && (!addr || !bySym.address)) holding = bySym
      }
      if (!holding) continue
      matches.push({
        collateral,
        holding,
        primary: collateral.isPrimary === true ? 0 : 1,
        preference: preferenceRank(sym),
        usdValue: finitePositive(holding.usdValue),
      })
    }
    if (matches.length === 0) return null

    matches.sort((a, b) => {
      if (a.primary !== b.primary) return a.primary - b.primary
      if (a.preference !== b.preference) return a.preference - b.preference
      // Same asset class: the deeper balance leaves the most room to size up. Only USD values are
      // comparable — raw balances across different decimals are not the same unit.
      return compareNullable(a.usdValue, b.usdValue, 0, 'desc')
    })

    const best = matches[0]
    return {
      ...best.collateral,
      balance: best.holding.balance,
      decimals: best.collateral.decimals ?? best.holding.decimals ?? null,
      usdValue: best.usdValue,
    }
  } catch {
    return null
  }
}

function preferenceRank(symbol) {
  const i = symbol ? PREFERRED_COLLATERAL.indexOf(symbol) : -1
  return i === -1 ? PREFERRED_COLLATERAL.length : i
}

function hasPositiveBalance(balance) {
  if (typeof balance === 'bigint') return balance > 0n
  if (typeof balance === 'string') {
    const s = balance.trim()
    if (s === '') return false
    if (/^\d+$/.test(s)) return BigInt(s) > 0n
  }
  const n = Number(balance)
  return Number.isFinite(n) && n > 0
}

/* ------------------------------------------------------------------------------------------- *
 * Slippage
 * ------------------------------------------------------------------------------------------- */

/**
 * Default price tolerance, in PERCENT — not bps and not the venues' 1e3 scale, which the calldata
 * encoders apply. 1% matches the Gains SDK's own default closing slippage, so a member sees the
 * same tolerance the venue's own app would have used rather than a number FairWins invented.
 */
export function defaultSlippage() {
  return GAINS_DEFAULT_CLOSING_SLIPPAGE_P
}

/* ------------------------------------------------------------------------------------------- *
 * Suggested protection
 * ------------------------------------------------------------------------------------------- */

/** The stop sits this far along the distance from the current price to liquidation. */
const STOP_FRACTION_OF_LIQUIDATION_DISTANCE = 0.5
/** Take-profit is placed at this multiple of the stop's distance — a 2:1 target on the risk taken. */
const REWARD_TO_RISK = 2

/**
 * Suggested stop-loss and take-profit for a position, both guaranteed to be levels
 * `validateProtection` accepts: strictly INSIDE the liquidation bound and on the correct side of
 * the current price. That guarantee is the point of this function — a suggestion the app would
 * then refuse is worse than no suggestion, and a test pins the two together.
 *
 * The reference is the CURRENT price, falling back to entry: a stop is measured against where the
 * market is now, and on a position that has already moved, a stop derived from entry can sit on
 * the wrong side of the market and trigger the instant it is set.
 *
 * @param entry            the position's entry price (the fallback reference)
 * @param mark             the current price, when known — preferred over entry
 * @param leverage         used only when the venue does not report a liquidation price: at Nx the
 *                         liquidation distance is approximately price/N before fees
 * @param isLong           direction — every sign below flips with it
 * @param liquidationPrice the venue's own liquidation price, preferred over the leverage estimate
 * @returns `{ stopLoss, takeProfit }`, each null when it cannot be derived honestly.
 */
export function suggestProtection(input) {
  const none = { stopLoss: null, takeProfit: null }
  try {
    const { entry, mark, leverage, isLong, liquidationPrice } = input ?? {}
    if (isLong !== true && isLong !== false) return none
    const reference = finitePositive(mark) ?? finitePositive(entry)
    if (reference === null) return none

    const liq = finitePositive(liquidationPrice)
    let distance = null
    if (liq !== null) {
      // A liquidation price on the wrong side of the market is contradictory data, not a bound we
      // can place a stop inside — suggest nothing rather than something unsafe.
      const gap = isLong ? reference - liq : liq - reference
      if (gap <= 0) return none
      distance = gap
    } else {
      const lev = finitePositive(leverage)
      if (lev === null) return none
      distance = reference / lev
    }

    const stopOffset = distance * STOP_FRACTION_OF_LIQUIDATION_DISTANCE
    const stopLoss = isLong ? reference - stopOffset : reference + stopOffset
    // Half the distance to liquidation cannot reach zero for a long, but a contrived leverage
    // below 2x can — and a non-positive price is not a stop.
    if (!(stopLoss > 0)) return none
    // Re-assert the guarantee on the computed value rather than trusting the arithmetic: with a
    // liquidation price a rounding tick away from the mark, the midpoint can land ON a bound, and
    // `validateProtection` refuses at the boundary (`<=` / `>=`), not merely beyond it.
    const strictlyInside = isLong
      ? stopLoss < reference && (liq === null || stopLoss > liq)
      : stopLoss > reference && (liq === null || stopLoss < liq)
    if (!strictlyInside) return none

    const takeProfit = isLong
      ? reference + stopOffset * REWARD_TO_RISK
      : reference - stopOffset * REWARD_TO_RISK
    return {
      stopLoss,
      takeProfit: takeProfit > 0 && (isLong ? takeProfit > reference : takeProfit < reference) ? takeProfit : null,
    }
  } catch {
    return none
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Shared numeric helpers
 * ------------------------------------------------------------------------------------------- */

function finite(value) {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function finitePositive(value) {
  const n = finite(value)
  return n !== null && n > 0 ? n : null
}
