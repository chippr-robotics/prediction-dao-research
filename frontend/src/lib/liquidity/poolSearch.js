/**
 * Searching and narrowing the Earn → Supply pool list (spec 067, FR-015/FR-024).
 *
 * The curated list spans every network with a `LiquidityRouter`, holds both pool
 * kinds together, and is only going to get longer — so a member needs to be able
 * to find "the USDC pool on Base" without reading the whole thing. This module is
 * the whole of that narrowing, kept out of the view so it can be tested directly.
 *
 * ── THREE RULES, EACH FOR A REASON ──────────────────────────────────────────
 *
 * 1. NARROWING IS BY IDENTITY, NEVER BY STATE (FR-024). The haystack is what a
 *    pool IS — its assets, its protocol, its network, its kind — and deliberately
 *    NOT whether it is taking deposits. A retired or unreachable pool matches its
 *    own name exactly like an open one, because a member's exit must stay
 *    findable while their money is in it. Nothing here may grow a "hide closed
 *    pools" behaviour by accident.
 *
 * 2. IT NARROWS THE CATALOG, NEVER THE MEMBER'S POSITIONS. `SupplyView` runs the
 *    positions list above this filter, untouched: a search box that could hide a
 *    position would hide money.
 *
 * 3. EVERY TERM MUST MATCH (AND, not OR). "usdc base" means the USDC pool on
 *    Base — an OR would answer that with every USDC pool everywhere plus every
 *    Base pool, which is not narrowing at all.
 *
 * Matching is substring, case-insensitive, over the words the row itself shows,
 * so anything a member can read on a row is something they can type.
 */
import { LIQUIDITY_KIND_LABEL, LIQUIDITY_POOL_KIND, poolKindOf } from './liquidityCopy'

/** The kind filter's "everything" value — an absence of narrowing, not a kind. */
export const POOL_KIND_FILTER_ALL = 'all'

/** The kind chips, in list order. Labels come from the shared copy table. */
export const POOL_KIND_FILTERS = Object.freeze([
  Object.freeze({ value: POOL_KIND_FILTER_ALL, label: 'All' }),
  Object.freeze({ value: LIQUIDITY_POOL_KIND.TRADING_LP, label: 'Trading' }),
  Object.freeze({ value: LIQUIDITY_POOL_KIND.BRIDGE_LP, label: 'Bridge' }),
])

/**
 * The searchable text of one pool: what it holds, who runs it, where it lives,
 * and which kind it is. Rule 1 — no state, no availability, no fee.
 * @param {object} pool
 * @returns {string} lowercased haystack
 */
export function poolSearchText(pool) {
  const symbols = (pool?.assets || []).map((a) => a?.symbol).filter(Boolean)
  const kind = poolKindOf(pool?.kind)
  return [
    ...symbols,
    // The joined pair label too, so typing what the row reads — "USDC / WETH" —
    // matches as one term rather than only as its two halves.
    symbols.join(' / '),
    pool?.protocol,
    pool?.networkName,
    kind ? LIQUIDITY_KIND_LABEL[kind] : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * A query string → the terms it asks for. Whitespace-separated, empties dropped.
 * @param {string} query
 * @returns {string[]}
 */
export function poolSearchTerms(query) {
  return String(query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Does this pool answer the query? An empty query matches everything — a blank
 * search box narrows nothing.
 * @param {object} pool
 * @param {string} query
 * @returns {boolean}
 */
export function poolMatchesQuery(pool, query) {
  const terms = poolSearchTerms(query)
  if (terms.length === 0) return true
  const haystack = poolSearchText(pool)
  return terms.every((term) => haystack.includes(term))
}

/**
 * The list a member sees, given everything currently narrowing it.
 *
 * `tokenSymbol` is the deep link the portfolio's Earn action arrives with
 * (?token=USDC) and stays an EXACT symbol match; `query` is what the member
 * typed and is a loose substring search; `kind` is the chip row. All three
 * compose, and none of them may consider a pool's state (rule 1).
 *
 * @param {object[]} pools
 * @param {{query?: string, kind?: string, tokenSymbol?: string|null}} [narrowing]
 * @returns {object[]} the same pool objects, in the same order
 */
export function filterPools(pools, { query = '', kind = POOL_KIND_FILTER_ALL, tokenSymbol = null } = {}) {
  let list = Array.isArray(pools) ? pools : []

  if (tokenSymbol) {
    const wanted = String(tokenSymbol).toUpperCase()
    list = list.filter((p) =>
      (p?.assets || []).some((a) => (a?.symbol || '').toUpperCase() === wanted),
    )
  }

  if (kind && kind !== POOL_KIND_FILTER_ALL) {
    list = list.filter((p) => poolKindOf(p?.kind) === kind)
  }

  const terms = poolSearchTerms(query)
  if (terms.length > 0) {
    list = list.filter((p) => {
      const haystack = poolSearchText(p)
      return terms.every((term) => haystack.includes(term))
    })
  }

  return list
}

/** Which kinds are present in a list — the chip row only appears when both are. */
export function poolKindsPresent(pools) {
  const kinds = new Set()
  for (const pool of pools || []) {
    const kind = poolKindOf(pool?.kind)
    if (kind) kinds.add(kind)
  }
  return kinds
}
