/**
 * Predict gateway client (spec 057) — the SPA side of the relay-gateway's /v1/polymarket/* proxy
 * (specs/057-predict-polymarket/contracts/gateway-predict-api.md).
 *
 * The Polymarket API key + L2 credentials live ONLY in the gateway (FR-016); this client sends no
 * auth material of its own (the Cloudflare edge injects X-Origin-Auth in transit). Soft-fail by
 * design: with VITE_RELAYER_URL unset the feature reports unavailable and every Predict surface hides
 * (FR-018) — mirroring the collectibles gateway client.
 *
 * A `409 price_changed` is surfaced as its own code so the trade flow re-confirms the current price
 * rather than filling stale (FR-008).
 */
import { getNetwork } from '../../config/networks'

const FETCH_TIMEOUT_MS = 12_000

/** Transport failure, timeout, 5xx, killswitch, or quota exhaustion — callers show the degraded state. */
export class PredictUnavailable extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'PredictUnavailable'
    this.code = code || 'unavailable'
    if (cause !== undefined) this.cause = cause
  }
}

/** The configured gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function predictGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Whether Predict exists at all for this chain: Polymarket must serve the network (capability flag,
 * Polygon only) AND a gateway must be configured. False hides the tab entirely (FR-018).
 */
export function predictAvailable(chainId) {
  return Boolean(getNetwork(chainId)?.capabilities?.predict) && predictGatewayUrl() !== ''
}

async function request(path, { method = 'GET', body } = {}) {
  const base = predictGatewayUrl()
  if (!base) throw new PredictUnavailable('predict gateway is not configured', { code: 'unconfigured' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${base}${path}`, {
      method,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
  } catch (e) {
    throw new PredictUnavailable(`predict gateway unreachable: ${e?.message || e}`, {
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      cause: e,
    })
  } finally {
    clearTimeout(timer)
  }

  if (res.ok) return res.json()

  let errBody = null
  try {
    errBody = await res.json()
  } catch {
    /* non-JSON error */
  }
  const code = errBody?.error?.code || `http_${res.status}`
  const err = new PredictUnavailable(errBody?.error?.reason || `predict request failed (${res.status})`, { code })
  err.status = res.status
  throw err
}

/** Browse/search markets → { markets, next, fetchedAt, stale }. */
export function fetchMarkets(chainId, { q = '', category = '', next = '' } = {}) {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (category) qs.set('category', category)
  if (next) qs.set('next', next)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request(`/v1/polymarket/${chainId}/markets${suffix}`)
}

/** Market detail → normalized Market DTO. */
export function fetchMarket(chainId, conditionId) {
  return request(`/v1/polymarket/${chainId}/markets/${encodeURIComponent(conditionId)}`)
}

/**
 * Live fee schedule for a token → { feeRateBps, builderTakerFeeBps, builderMakerFeeBps }. Throws when
 * unavailable → the caller blocks signing rather than guessing a fee (FR-010).
 */
export function fetchFeeRate(chainId, tokenId) {
  return request(`/v1/polymarket/${chainId}/fee-rate?token_id=${encodeURIComponent(tokenId)}`)
}

/** The connected address's positions → { positions }. */
export function fetchPositions(chainId, address) {
  return request(`/v1/polymarket/${chainId}/positions?address=${encodeURIComponent(address)}`)
}

/** The connected address's open (unfilled) orders → { orders }. */
export function fetchOpenOrders(chainId, address) {
  return request(`/v1/polymarket/${chainId}/orders?address=${encodeURIComponent(address)}`)
}

/**
 * Submit a client-signed CLOB order carrying the builder code → { orderId, status, builder }.
 * A `409 price_changed` becomes a PredictUnavailable with code `price_changed` so the caller
 * re-confirms the current price (FR-008).
 */
export function submitOrder(chainId, { order, signature }) {
  return request(`/v1/polymarket/${chainId}/order`, { method: 'POST', body: { order, signature } })
}

/** Cancel an open order → { cancelled }. */
export function cancelOrder(chainId, { orderId, address, signature }) {
  return request(`/v1/polymarket/${chainId}/order/cancel`, { method: 'POST', body: { orderId, address, signature } })
}
