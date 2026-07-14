/**
 * Polymarket Predict proxy routes — /v1/polymarket/* (spec 057).
 *
 * Contract: specs/057-predict-polymarket/contracts/gateway-predict-api.md.
 * Pipeline per request: killswitch -> fail-closed key check -> Polygon-only check -> param validation
 * -> quota -> (reads) cached fetch / (writes) attach builder code + forward the client-signed order.
 * The gateway holds the Polymarket key + L2 creds (FR-016); clients only ever see normalized DTOs.
 * Nothing here touches intents, funds, or signing keys — a total outage leaves every value path intact
 * (FR-020). The member's own wallet is the only order signer; the gateway just forwards signed orders.
 */
import express from 'express'
import { GatewayError } from '../errors.js'
import { PolymarketRequestError } from './client.js'
import { attachBuilderCode } from './builderCode.js'
import {
  isSupportedChain,
  isAddress,
  isTokenId,
  isCursor,
  normalizeMarket,
  normalizeMarketPage,
  normalizeFeeRate,
  normalizePositionsList,
  normalizeOpenOrdersList,
  validateOrderBody,
  validateCancelBody,
} from './normalize.js'

/**
 * @param {object} config full gateway config (only .polymarket is read)
 * @param {{
 *   client: {get: Function, post: Function},
 *   cache: {fetchThrough: Function},
 *   quotas: {hit: Function},
 *   writeQuotas: {hit: Function},
 *   killSwitch: {isActive: () => boolean},
 * }} deps
 */
export function createPolymarketRouter(config, { client, cache, quotas, writeQuotas, killSwitch }) {
  const pm = config.polymarket
  const router = express.Router()

  /** Killswitch + fail-closed key (shared by reads and writes). */
  function requireLive() {
    if (killSwitch.isActive()) {
      throw new GatewayError(503, 'killswitch_active', 'the gateway is temporarily disabled; try again later')
    }
    if (!pm.apiKey) {
      throw new GatewayError(503, 'predict_unconfigured', 'prediction-market trading is not configured on this gateway')
    }
  }

  function guard(quotaKey) {
    requireLive()
    const q = quotas.hit(quotaKey)
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} predict read quota exceeded`, { retryAfterSec: q.retryAfterSec })
    }
  }

  /** Write pre-flight: live check + the tighter write quota, keyed by the trader address. */
  function guardWrite(quotaKey) {
    requireLive()
    const q = (writeQuotas ?? quotas).hit(quotaKey)
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} predict write quota exceeded`, { retryAfterSec: q.retryAfterSec })
    }
  }

  /** Polygon-only guard, or 404 unsupported_chain (soft-fail contract, FR-018). */
  function requirePolygon(chainIdParam) {
    if (!isSupportedChain(chainIdParam)) {
      throw new GatewayError(404, 'unsupported_chain', 'prediction markets are only available on Polygon')
    }
  }

  const respond = (res, { value, fetchedAt, stale }) =>
    res.json({ ...value, fetchedAt: new Date(fetchedAt).toISOString(), stale })

  function handleError(res, err) {
    if (err instanceof GatewayError) {
      if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json(err.toBody())
    }
    if (err instanceof PolymarketRequestError) {
      if (err.status === 404) {
        return res.status(404).json({ error: { code: 'not_found', reason: 'the marketplace does not know this market' } })
      }
      // Surface Polymarket's own rejection reason (e.g. below-minimum, bad token) so the member can act.
      const reason = typeof err.message === 'string' ? err.message.replace(/^polymarket rejected request \(\d+\): /, '').slice(0, 200) : ''
      return res.status(502).json({ error: { code: 'upstream_rejected', reason: reason || 'the marketplace rejected this request' } })
    }
    // PolymarketUnavailableError and anything unexpected: degraded, cache had nothing to serve.
    return res
      .status(503)
      .json({ error: { code: 'upstream_unavailable', reason: 'prediction-market data is temporarily unavailable; try again later' } })
  }

  // ---- GET /v1/polymarket/:chainId/markets (list/search) --------------------------------------
  router.get('/v1/polymarket/:chainId/markets', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const next = req.query.next ?? null
      const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 128) : ''
      const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 64) : ''
      if (!isCursor(next)) throw new GatewayError(400, 'invalid_cursor', 'malformed pagination cursor')
      guard(`markets:${search}:${category}`)

      const result = await cache.fetchThrough(
        `markets:${search}:${category}:${next ?? ''}`,
        pm.cacheTtlMs,
        async () => {
          const body = await client.get('/markets', {
            query: { ...(next ? { next_cursor: next } : {}), ...(search ? { q: search } : {}), ...(category ? { category } : {}) },
          })
          return normalizeMarketPage(body)
        }
      )
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/polymarket/:chainId/markets/:conditionId ---------------------------------------
  router.get('/v1/polymarket/:chainId/markets/:conditionId', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const { conditionId } = req.params
      if (typeof conditionId !== 'string' || conditionId.length < 3 || conditionId.length > 128) {
        throw new GatewayError(400, 'invalid_market', 'condition id is malformed')
      }
      guard(`market:${conditionId}`)

      const result = await cache.fetchThrough(`market:${conditionId}`, pm.cacheTtlMs, async () => {
        const body = await client.get(`/markets/${conditionId}`)
        const market = normalizeMarket(body?.market ?? body)
        if (!market) throw new PolymarketRequestError(404, 'market not present upstream')
        return market
      })
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/polymarket/:chainId/fee-rate?token_id= -----------------------------------------
  // The live platform-fee basis the client shows (and the additive builder fee is layered on from
  // config). A null schedule -> 503 so the client blocks signing rather than guessing (FR-010).
  router.get('/v1/polymarket/:chainId/fee-rate', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const tokenId = typeof req.query.token_id === 'string' ? req.query.token_id : ''
      if (!isTokenId(tokenId)) throw new GatewayError(400, 'invalid_token', 'token_id must be a numeric token id')
      guard(`fee:${tokenId}`)

      const result = await cache.fetchThrough(`fee:${tokenId}`, pm.cacheTtlMs, async () => {
        const body = await client.get('/fee-rate', { query: { token_id: tokenId } })
        const fee = normalizeFeeRate(body, tokenId)
        // No confirmable schedule -> block signing with a retryable state, never a guessed/hardcoded
        // fee (FR-010). 503 (try again) rather than 404 (not_found) because the market itself exists.
        if (!fee) throw new GatewayError(503, 'fee_unavailable', 'could not confirm the fee schedule; try again')
        // Echo the configured builder fee so the client shows the honest, additive total (FR-012).
        const builder = attachBuilderCode(config, { chainId: 137 })
        return { ...fee, builderTakerFeeBps: builder.takerFeeBps, builderMakerFeeBps: builder.makerFeeBps }
      })
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/polymarket/:chainId/positions?address= -----------------------------------------
  router.get('/v1/polymarket/:chainId/positions', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const address = typeof req.query.address === 'string' ? req.query.address : ''
      if (!isAddress(address)) throw new GatewayError(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address')
      guard(address.toLowerCase())

      const result = await cache.fetchThrough(`positions:${address.toLowerCase()}`, pm.cacheTtlMs, async () => {
        const body = await client.get('/positions', { query: { user: address }, auth: true })
        return normalizePositionsList(body)
      })
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/polymarket/:chainId/orders?address= (open orders) ------------------------------
  router.get('/v1/polymarket/:chainId/orders', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const address = typeof req.query.address === 'string' ? req.query.address : ''
      if (!isAddress(address)) throw new GatewayError(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address')
      guard(address.toLowerCase())

      const result = await cache.fetchThrough(`orders:${address.toLowerCase()}`, pm.cacheTtlMs, async () => {
        const body = await client.get('/data/orders', { query: { maker: address }, auth: true })
        return normalizeOpenOrdersList(body)
      })
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/polymarket/:chainId/order -----------------------------------------------------
  // Submit a client-signed CLOB order. Write quota keyed by the trader (maker). attachBuilderCode
  // asserts the order carries FairWins' code (or the zero code when unattributed — never stranded,
  // FR-015). NOT retried on 5xx (client.post) — order submission is not idempotent.
  router.post('/v1/polymarket/:chainId/order', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const isMaker = Boolean(req.body?.order?.isMaker)
      const builder = attachBuilderCode(config, { chainId: 137, isMaker })
      const invalid = validateOrderBody(req.body, builder.source === 'attributed' ? builder.builderCode : null)
      if (invalid) throw new GatewayError(400, invalid, 'the order is malformed or attribution was altered')
      const maker = req.body.order.maker
      guardWrite(maker.toLowerCase())

      let upstream
      try {
        upstream = await client.post('/order', { order: req.body.order, signature: req.body.signature })
      } catch (e) {
        // A market that moved (price/tick) is not an outage — ask the client to re-confirm (FR-008).
        if (e instanceof PolymarketRequestError && /price|tick|marketable/i.test(e.message)) {
          throw new GatewayError(409, 'price_changed', 'the market moved; review the current price and try again')
        }
        throw e
      }
      res.json({
        orderId: upstream?.orderID ?? upstream?.orderId ?? upstream?.id ?? null,
        status: upstream?.status ?? (upstream?.success ? 'accepted' : null),
        builder: { source: builder.source, feeBps: builder.feeBps },
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/polymarket/:chainId/order/cancel ----------------------------------------------
  router.post('/v1/polymarket/:chainId/order/cancel', async (req, res) => {
    try {
      requirePolygon(req.params.chainId)
      const invalid = validateCancelBody(req.body)
      if (invalid) throw new GatewayError(400, invalid, 'the cancel request is malformed')
      guardWrite(req.body.address.toLowerCase())

      const upstream = await client.post('/order/cancel', { orderID: req.body.orderId })
      res.json({ cancelled: upstream?.canceled != null ? Boolean(upstream.canceled) : Boolean(upstream?.success ?? true) })
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
