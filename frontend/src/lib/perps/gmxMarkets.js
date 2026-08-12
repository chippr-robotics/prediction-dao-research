/**
 * GMX market address → the pair it trades (spec 083 US3/US5).
 *
 * WHY THIS EXISTS. GMX's `Reader.getAccountPositions` names a MARKET ADDRESS and nothing else —
 * no symbol, no price. A position row therefore arrived with `symbol: null`, and because the
 * current price is composed by matching a position to the venue's own pairs feed ON SYMBOL, every
 * GMX row read "Current price —" forever and the sheet refused every close for want of a price.
 *
 * WHERE THE ANSWER COMES FROM — the feed already on screen, not a new network read. The gateway
 * publishes each GMX pair with the market token inside its id
 * (`gmx:<chainId>:<symbol>:<marketToken>`, `services/relay-gateway/src/perps/normalize.js`), so
 * the mapping a position needs is already fetched, already polled, and already the exact record
 * whose `price` the pairs table is rendering. Reading GMX's own market metadata on-chain would add
 * an Arbitrum round trip per render to learn something the app was handed thirty seconds ago.
 *
 * RESOLUTION IS TOTAL, AND A MISS IS A MISS. Every lookup is an EXACT match on (chainId, market
 * address). Nothing here falls back to a base symbol, a prefix, or "the only BTC market": an
 * unresolvable market keeps `symbol: null` and renders '—', because a wrong pair on a leveraged
 * position is worse than no pair at all. Two feed records claiming the same market with different
 * pairs poison that key rather than pick one (`AMBIGUOUS` below).
 *
 * THE VARIANT IS PART OF THE ANSWER. GMX lists several markets on one base pair —
 * "BTC/USD [WBTC.b-USDC]" and "BTC/USD [BTC-USDC]" are different markets with different
 * collateral — so the resolved row carries the venue's own variant beside the symbol and the
 * surfaces render it. Without it two rows on one screen would be indistinguishable.
 *
 * Pure functions over plain data: no network, no clock, no gate. This module sits on the exit path
 * (it is what gives a GMX close a price to bound itself with) and is classified there in
 * `test/perps/safetyInvariants.test.js`.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * `gmx:<chainId>:<symbol>:<marketToken>`.
 *
 * The symbol segment is matched greedily with the address ANCHORED at the end, so a symbol that
 * itself contains a colon still parses and the market token is always the last segment — never
 * "the fourth thing after splitting", which would silently take a fragment of the symbol on a pair
 * the venue names differently tomorrow.
 */
const GMX_PAIR_ID_RE = /^gmx:(\d+):(.+):(0x[0-9a-fA-F]{40})$/

/**
 * A key claimed by two different pairs. It is kept in the index (rather than deleted) so a later
 * duplicate cannot resurrect the first record: once a market address is ambiguous in one feed it
 * stays unresolvable for that feed.
 */
const AMBIGUOUS = Symbol('gmx-market-ambiguous')

/** `{ chainId, symbol, marketToken }`, or null for anything that is not a GMX pair id. */
export function parseGmxPairId(id) {
  if (typeof id !== 'string') return null
  const match = GMX_PAIR_ID_RE.exec(id)
  if (!match) return null
  const chainId = Number(match[1])
  if (!Number.isInteger(chainId) || chainId <= 0) return null
  const symbol = match[2]
  if (!symbol) return null
  return { chainId, symbol, marketToken: match[3] }
}

/** The index key: a market address means nothing without the chain it lives on. */
export function gmxMarketKey(chainId, marketToken) {
  const chain = Number(chainId)
  if (!Number.isInteger(chain) || chain <= 0) return null
  if (typeof marketToken !== 'string' || !ADDRESS_RE.test(marketToken)) return null
  return `${chain}:${marketToken.toLowerCase()}`
}

/**
 * The venue feed → a market-address index.
 *
 * Built from `allPairs` (the UNFILTERED feed): the member's search box shapes the pairs TABLE and
 * must never decide whether their own position can be named or priced.
 *
 * A record that disagrees with itself — an id whose chain is not the chain the pair declares — is
 * skipped rather than reconciled. There is no reading of that record that is known to be the true
 * one, and this map's whole value is that a hit is exact.
 */
export function buildGmxMarketIndex(pairs) {
  const index = new Map()
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (pair?.venue !== 'gmx') continue
    const parsed = parseGmxPairId(pair.id)
    if (!parsed) continue
    if (pair.chainId != null && Number(pair.chainId) !== parsed.chainId) continue
    const key = gmxMarketKey(parsed.chainId, parsed.marketToken)
    if (!key) continue

    const record = Object.freeze({
      id: pair.id,
      chainId: parsed.chainId,
      marketToken: parsed.marketToken,
      // The pair's own field first — the id is the transport, not the source of truth for display.
      symbol: text(pair.symbol) ?? parsed.symbol,
      variant: text(pair.variant),
      price: positivePrice(pair.price),
      // The market's base asset, and the collaterals GMX accepts on it with their decimals and the
      // venue's own USD price. They are carried because a GMX position arrives in RAW VENUE UNITS
      // and these are the only scales that turn it into money (`gmxDerived.js`) — a collateral
      // whose decimals or price the feed did not publish is kept with those fields null rather than
      // dropped, so a consumer sees "GMX did not price it" instead of "GMX does not accept it".
      base: text(pair.base) ?? baseFromSymbol(text(pair.symbol) ?? parsed.symbol),
      collaterals: collateralList(pair),
    })

    const seen = index.get(key)
    if (seen === undefined) {
      index.set(key, record)
    } else if (seen === AMBIGUOUS || !sameMarket(seen, record)) {
      index.set(key, AMBIGUOUS)
    }
  }
  return index
}

/**
 * The feed record for a GMX position's market, or null when it cannot be established EXACTLY.
 *
 * Null covers every kind of miss with one answer — not a GMX row, no market address on the row, a
 * market this feed does not list, a feed that could not be read, two records claiming the market —
 * because every one of them means the same thing to a member: this app does not know which pair
 * that is, so it will not say.
 */
export function findGmxPair(position, index) {
  if (position?.venue !== 'gmx') return null
  if (!(index instanceof Map) || index.size === 0) return null
  const key = gmxMarketKey(position.chainId, marketAddressOf(position))
  if (!key) return null
  const found = index.get(key)
  return found === undefined || found === AMBIGUOUS ? null : found
}

/** The venue's live price for a position's market, or null. Never a guess, never a 0. */
export function gmxMarketPrice(position, index) {
  return findGmxPair(position, index)?.price ?? null
}

/**
 * Positions with each GMX row's `symbol` (and `variant`) filled in from the feed.
 *
 * Every other row passes through UNTOUCHED — this is a GMX-shaped hole being filled, not a
 * normalization pass over positions, and per-venue isolation means a Gains row cannot change
 * because of anything GMX did or did not report. A row that already carries a symbol is left
 * alone: a producer's own answer outranks this composition.
 *
 * Returns the ORIGINAL array when nothing resolved, so a memo downstream does not see a new
 * identity (and re-render) on every poll that changed nothing.
 */
export function withGmxMarketSymbols(positions, index) {
  const rows = Array.isArray(positions) ? positions : []
  let changed = false
  const next = rows.map((row) => {
    if (row?.venue !== 'gmx' || text(row.symbol)) return row
    const pair = findGmxPair(row, index)
    if (!pair) return row
    changed = true
    return Object.freeze({ ...row, symbol: pair.symbol, variant: pair.variant })
  })
  return changed ? next : rows
}

/* ------------------------------------------------------------------------------------------- *
 * Internals
 * ------------------------------------------------------------------------------------------- */

/**
 * The market a position is held in. `venueRef.market` is the branded handle
 * (`usePerpsPositions#toGmxPosition`); the decoded venue units are read only as a fallback for a
 * row assembled before the ref existed. Neither is trusted without the address check — a
 * malformed value must fail to resolve, not resolve to something else.
 */
function marketAddressOf(position) {
  const ref = position?.venueRef?.market
  if (typeof ref === 'string' && ADDRESS_RE.test(ref)) return ref
  const raw = position?.raw?.market
  return typeof raw === 'string' && ADDRESS_RE.test(raw) ? raw : null
}

/** 'BTC/USD' → 'BTC'. Display/scale metadata only — never used to match a market. */
function baseFromSymbol(symbol) {
  if (typeof symbol !== 'string' || !symbol.includes('/')) return null
  return text(symbol.split('/')[0])
}

/**
 * The feed's collateral entries for a market, normalized. An entry with no usable address is
 * dropped (it names no token); decimals and price are kept as null when the feed did not publish
 * them, because "GMX did not price this" is a fact a consumer must be able to see rather than
 * infer from an absence.
 */
function collateralList(pair) {
  const out = []
  for (const c of Array.isArray(pair?.collaterals) ? pair.collaterals : []) {
    const address = typeof c?.address === 'string' && ADDRESS_RE.test(c.address) ? c.address : null
    if (!address) continue
    const decimals = Number(c?.decimals)
    out.push(
      Object.freeze({
        symbol: text(c?.symbol),
        address,
        decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : null,
        usdPrice: positivePrice(c?.usdPrice),
      }),
    )
  }
  return Object.freeze(out)
}

/** Two feed records describe the same market when they name the same pair; price may move. */
function sameMarket(a, b) {
  return a.symbol === b.symbol && a.variant === b.variant
}

/** A non-empty string, or null — an empty symbol is an absent one, never a rendered blank. */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A tradeable price, or null. 0 is not a price a member may see next to their money. */
function positivePrice(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
