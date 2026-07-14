/**
 * Polymarket CLOB -> gateway DTO normalization for the /v1/polymarket/* Predict proxy (spec 057).
 *
 * The gateway never passes Polymarket's response shape through to clients: every field the SPA
 * consumes is mapped here, so upstream schema drift breaks THIS module's tests, not the frontend.
 * Monetary amounts always travel as {amount, currency} pairs (USDC) — never a bare number.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]*$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
// CLOB token ids are large decimal strings (uint256). Allow 1-78 digits.
const TOKEN_ID_RE = /^\d{1,78}$/
const CURSOR_MAX = 512

/** Polymarket runs only on Polygon (137). Anything else soft-fails as unsupported_chain (FR-018). */
const SUPPORTED_CHAIN = 137

export const isSupportedChain = (chainId) => Number(chainId) === SUPPORTED_CHAIN
export const isAddress = (v) => typeof v === 'string' && ADDRESS_RE.test(v)
export const isTokenId = (v) => typeof v === 'string' && TOKEN_ID_RE.test(v)
export const isHex = (v) => typeof v === 'string' && HEX_RE.test(v)
export const isBytes32 = (v) => typeof v === 'string' && BYTES32_RE.test(v)
export const isCursor = (v) => v == null || (typeof v === 'string' && v.length > 0 && v.length <= CURSOR_MAX)

/** Deep link to the exact market on Polymarket (never-stranded fallback). */
export function polymarketMarketUrl(slug) {
  return slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com'
}

/** {amount, currency:'USDC'} or null. Callers render explicit "no price / illiquid" states for null. */
export function usdcQuote(amount) {
  if (amount == null || amount === '') return null
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return null
  return { amount: String(amount), currency: 'USDC' }
}

/** A price in [0,1] (probability) as a string, or null. */
function normalizePrice(p) {
  const n = Number(p)
  if (!Number.isFinite(n) || n < 0 || n > 1) return null
  return String(p)
}

/** One market outcome/token -> {name, tokenId, price}, or null when unusable. */
function normalizeOutcome(raw) {
  if (!raw) return null
  const tokenId = String(raw.token_id ?? raw.tokenId ?? raw.asset_id ?? '')
  if (!isTokenId(tokenId)) return null
  return {
    name: typeof raw.outcome === 'string' && raw.outcome !== '' ? raw.outcome : (raw.name ?? 'Outcome'),
    tokenId,
    price: normalizePrice(raw.price),
  }
}

/**
 * One CLOB market -> Market DTO, or null when the record is unusable (dropped upstream of the client
 * so a single malformed market never breaks the grid). Defensive against field-name drift.
 */
export function normalizeMarket(raw) {
  if (!raw) return null
  const conditionId = raw.condition_id ?? raw.conditionId ?? raw.id
  if (typeof conditionId !== 'string' || conditionId === '') return null
  const tokensRaw = Array.isArray(raw.tokens) ? raw.tokens : Array.isArray(raw.outcomes) ? raw.outcomes : []
  const outcomes = tokensRaw.map(normalizeOutcome).filter(Boolean)
  const closed = Boolean(raw.closed) || raw.active === false || raw.accepting_orders === false
  const slug = typeof raw.market_slug === 'string' ? raw.market_slug : (typeof raw.slug === 'string' ? raw.slug : null)
  return {
    conditionId,
    question: typeof raw.question === 'string' && raw.question !== '' ? raw.question : (raw.title ?? conditionId),
    category: typeof raw.category === 'string' ? raw.category : null,
    slug,
    outcomes,
    volume: usdcQuote(raw.volume ?? raw.volume_num ?? null),
    endDate: typeof raw.end_date_iso === 'string' ? raw.end_date_iso : (typeof raw.endDate === 'string' ? raw.endDate : null),
    negRisk: Boolean(raw.neg_risk ?? raw.negRisk),
    // Non-tradable markets show an honest state instead of a buy/sell affordance that would fail.
    tradable: !closed && outcomes.length > 0,
    polymarketUrl: polymarketMarketUrl(slug),
  }
}

/** Market-list body -> {markets, next}. */
export function normalizeMarketPage(body) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
  const markets = list.map(normalizeMarket).filter(Boolean)
  const next = typeof body?.next_cursor === 'string' && body.next_cursor !== '' && body.next_cursor !== 'LTE=' ? body.next_cursor : null
  return { markets, next }
}

/** Parse a Gamma stringified-JSON array field (outcomes/outcomePrices/clobTokenIds) -> array, or []. */
function parseJsonArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * One Gamma API market -> Market DTO (the discovery/browse source; live tradable markets by volume,
 * with search). Gamma encodes outcomes/prices/token-ids as stringified JSON arrays that we zip
 * together; field names are camelCase. Returns null when unusable.
 */
export function normalizeGammaMarket(raw) {
  if (!raw) return null
  const conditionId = raw.conditionId ?? raw.condition_id
  if (typeof conditionId !== 'string' || conditionId === '') return null
  const names = parseJsonArray(raw.outcomes)
  const tokenIds = parseJsonArray(raw.clobTokenIds)
  const prices = parseJsonArray(raw.outcomePrices)
  const outcomes = names
    .map((name, i) => {
      const tokenId = String(tokenIds[i] ?? '')
      if (!isTokenId(tokenId)) return null
      return { name: typeof name === 'string' ? name : `Outcome ${i + 1}`, tokenId, price: normalizePrice(prices[i]) }
    })
    .filter(Boolean)
  const closed = Boolean(raw.closed) || raw.active === false
  const slug = typeof raw.slug === 'string' ? raw.slug : null
  return {
    conditionId,
    question: typeof raw.question === 'string' && raw.question !== '' ? raw.question : (raw.title ?? conditionId),
    category: typeof raw.category === 'string' ? raw.category : null,
    slug,
    outcomes,
    volume: usdcQuote(raw.volumeNum ?? raw.volume ?? null),
    endDate: typeof raw.endDate === 'string' ? raw.endDate : null,
    negRisk: Boolean(raw.negRisk),
    tradable: !closed && outcomes.length > 0,
    polymarketUrl: polymarketMarketUrl(slug),
  }
}

/**
 * Assemble a Gamma market page. `q` filters by question text (Gamma /markets has no free-text param, so
 * we filter the volume-ranked page server-side); `next` is the next offset when the page was full.
 */
export function normalizeGammaPage(body, { q = '', offset = 0, limit = 100 } = {}) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  let markets = list.map(normalizeGammaMarket).filter(Boolean).filter((m) => m.tradable)
  const needle = q.trim().toLowerCase()
  if (needle) markets = markets.filter((m) => m.question.toLowerCase().includes(needle))
  const next = list.length >= limit ? String(offset + limit) : null
  return { markets, next }
}

/**
 * Live fee schedule for a token -> {tokenId, feeRateBps, takerOnly}. Polymarket instructs clients to
 * read fees live (never hardcode; research D3). Returns null when the schedule is missing so the
 * client blocks signing (FR-010) rather than guessing. `fd = {r, e, to}` is the CLOB market-info shape.
 */
export function normalizeFeeRate(body, tokenId) {
  const fd = body?.fd ?? body?.fee ?? body
  const rate = Number(fd?.r ?? fd?.fee_rate_bps ?? fd?.feeRateBps ?? fd?.base_fee ?? NaN)
  if (!Number.isFinite(rate) || rate < 0) return null
  return {
    tokenId: isTokenId(String(tokenId)) ? String(tokenId) : null,
    // Platform taker fee rate in bps (the additive builder fee is layered on client-side from config).
    feeRateBps: Math.round(rate),
    takerOnly: fd?.to == null ? true : Boolean(fd.to),
  }
}

/** One Data-API position -> {tokenId, conditionId, outcome, size, value, bestBid, negRisk}, or null. */
export function normalizePosition(raw) {
  if (!raw) return null
  const tokenId = String(raw.asset ?? raw.token_id ?? raw.tokenId ?? '')
  if (!isTokenId(tokenId)) return null
  const size = Number(raw.size ?? raw.balance ?? 0)
  if (!Number.isFinite(size) || size <= 0) return null
  return {
    tokenId,
    conditionId: typeof raw.conditionId === 'string' ? raw.conditionId : (raw.condition_id ?? null),
    outcome: typeof raw.outcome === 'string' ? raw.outcome : null,
    size: String(size),
    // Data-API uses camelCase currentValue + curPrice (the current mark, our sell-price proxy).
    value: usdcQuote(raw.currentValue ?? raw.current_value ?? raw.value ?? null),
    bestBid: usdcQuote(raw.curPrice ?? raw.price ?? null),
    negRisk: Boolean(raw.negativeRisk ?? raw.negRisk),
  }
}

/** One open order -> {orderId, tokenId, side, price, size, remaining}, or null. */
export function normalizeOpenOrder(raw) {
  if (!raw) return null
  const orderId = raw.id ?? raw.order_id ?? raw.orderHash
  if (typeof orderId !== 'string' || orderId === '') return null
  return {
    orderId,
    tokenId: String(raw.asset_id ?? raw.token_id ?? ''),
    side: raw.side === 'SELL' || raw.side === 1 ? 'SELL' : 'BUY',
    price: normalizePrice(raw.price),
    size: String(raw.original_size ?? raw.size ?? '0'),
    remaining: String(raw.size_remaining ?? raw.remaining ?? raw.size ?? '0'),
  }
}

export function normalizePositionsList(body) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
  return { positions: list.map(normalizePosition).filter(Boolean) }
}

export function normalizeOpenOrdersList(body) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
  return { orders: list.map(normalizeOpenOrder).filter(Boolean) }
}

/**
 * Validate a client-submitted signed CLOB order body (shape only — the signature is proven on-chain
 * by Polymarket; we refuse obviously malformed input before spending the write quota / upstream call).
 * When `expectedBuilder` is set, the order's `builder` field MUST equal it (or the zero bytes32 when
 * unattributed) so the client can't strip/alter attribution.
 */
export function validateOrderBody(body, expectedBuilder) {
  const order = body?.order
  if (!order || !isAddress(order.maker)) return 'invalid_order'
  if (!isTokenId(String(order.tokenId ?? ''))) return 'invalid_order'
  if (order.side !== 'BUY' && order.side !== 'SELL' && order.side !== 0 && order.side !== 1) return 'invalid_order'
  if (!isHex(body?.signature) || body.signature.length < 4) return 'invalid_order'
  if (order.builder != null && !isBytes32(order.builder)) return 'invalid_order'
  if (expectedBuilder && order.builder != null && order.builder.toLowerCase() !== expectedBuilder.toLowerCase()) {
    return 'builder_mismatch'
  }
  return null
}

/** Validate a cancel body: an order id/hash string + the trader address. */
export function validateCancelBody(body) {
  if (typeof body?.orderId !== 'string' || body.orderId === '') return 'invalid_order'
  if (!isAddress(body?.address)) return 'invalid_address'
  return null
}
