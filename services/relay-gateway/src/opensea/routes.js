/**
 * Read-only OpenSea proxy routes — /v1/opensea/* (spec 055 collectibles portfolio).
 *
 * Contract: specs/055-collectibles-portfolio/contracts/gateway-opensea-api.md.
 * Pipeline per request: killswitch -> fail-closed key check -> param validation -> quota ->
 * cached fetch (TTL + single-flight + serve-stale). GET-only; the gateway holds the OpenSea
 * key (FR-009) and clients only ever see normalized DTOs with {fetchedAt, stale} envelopes.
 * Nothing here touches intents, funds, or signing — a total outage of this group leaves every
 * value path intact (FR-011).
 */
import express from 'express'
import { GatewayError } from '../errors.js'
import { OpenSeaRequestError } from './client.js'
import {
  chainSlug,
  isAddress,
  isIdentifier,
  isSlug,
  isCursor,
  normalizeAccountPage,
  normalizeItemDetail,
  normalizeCollection,
} from './normalize.js'

/**
 * @param {{
 *   opensea: {apiKey: string|null, cacheTtlMs: number, statsCacheTtlMs: number},
 * }} config          full gateway config (only .opensea is read)
 * @param {{
 *   client: {get: Function},
 *   cache: {fetchThrough: Function},
 *   quotas: {hit: Function},
 *   killSwitch: {isActive: () => boolean},
 * }} deps
 */
export function createOpenSeaRouter(config, { client, cache, quotas, killSwitch }) {
  const os = config.opensea
  const router = express.Router()

  /** Shared pre-flight: killswitch, fail-closed key, quota (keyed per contract doc). */
  function guard(quotaKey) {
    if (killSwitch.isActive()) {
      throw new GatewayError(503, 'killswitch_active', 'the gateway is temporarily disabled; try again later')
    }
    if (!os.apiKey) {
      throw new GatewayError(503, 'collectibles_unconfigured', 'collectible data is not configured on this gateway')
    }
    const q = quotas.hit(quotaKey)
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} collectibles read quota exceeded`, {
        retryAfterSec: q.retryAfterSec,
      })
    }
  }

  /** chainId param -> OpenSea slug, or 404 unsupported_chain (soft-fail contract, FR-007). */
  function requireSlugForChain(chainIdParam) {
    const slug = chainSlug(chainIdParam)
    if (!slug) {
      throw new GatewayError(404, 'unsupported_chain', 'collectibles are not available on this network')
    }
    return slug
  }

  const respond = (res, { value, fetchedAt, stale }) =>
    res.json({ ...value, fetchedAt: new Date(fetchedAt).toISOString(), stale })

  function handleError(res, err) {
    if (err instanceof GatewayError) {
      if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json(err.toBody())
    }
    if (err instanceof OpenSeaRequestError) {
      // Definitive upstream 404 (unknown item/collection) is honest data, not an outage.
      if (err.status === 404) {
        return res.status(404).json({ error: { code: 'not_found', reason: 'the marketplace does not know this item' } })
      }
      return res.status(502).json({ error: { code: 'upstream_rejected', reason: 'the marketplace rejected this request' } })
    }
    // OpenSeaUnavailableError and anything unexpected: degraded, cache had nothing to serve.
    return res
      .status(503)
      .json({ error: { code: 'upstream_unavailable', reason: 'collectible data is temporarily unavailable; try again later' } })
  }

  // ---- GET /v1/opensea/:chainId/account/:address/nfts --------------------------------------
  router.get('/v1/opensea/:chainId/account/:address/nfts', async (req, res) => {
    try {
      const { address } = req.params
      const next = req.query.next ?? null
      const slug = requireSlugForChain(req.params.chainId)
      if (!isAddress(address)) throw new GatewayError(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address')
      if (!isCursor(next)) throw new GatewayError(400, 'invalid_cursor', 'malformed pagination cursor')
      guard(address.toLowerCase())

      const chainId = Number(req.params.chainId)
      const result = await cache.fetchThrough(
        `nfts:${chainId}:${address.toLowerCase()}:${next ?? ''}`,
        os.cacheTtlMs,
        async () => {
          const body = await client.get(`/api/v2/chain/${slug}/account/${address}/nfts`, {
            limit: '50',
            ...(next ? { next } : {}),
          })
          return normalizeAccountPage(body, chainId)
        }
      )
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/opensea/:chainId/contract/:contract/nfts/:identifier -------------------------
  // Composed: item detail + collection metadata + floor stats + best offer in one response, so
  // the detail sheet costs one round-trip and one cache entry. Floor/offer legs degrade to null
  // on failure (honest "unavailable" beats a failed sheet); only the item leg is fatal.
  router.get('/v1/opensea/:chainId/contract/:contract/nfts/:identifier', async (req, res) => {
    try {
      const { contract, identifier } = req.params
      const slug = requireSlugForChain(req.params.chainId)
      if (!isAddress(contract)) throw new GatewayError(400, 'invalid_address', 'contract must be a 0x-prefixed 20-byte hex address')
      if (!isIdentifier(identifier)) throw new GatewayError(400, 'invalid_identifier', 'token identifier must be 1-128 digits')
      guard(contract.toLowerCase())

      const chainId = Number(req.params.chainId)
      const result = await cache.fetchThrough(
        `item:${chainId}:${contract.toLowerCase()}:${identifier}`,
        os.cacheTtlMs,
        async () => {
          const nftBody = await client.get(`/api/v2/chain/${slug}/contract/${contract}/nfts/${identifier}`)
          const collectionSlug = typeof nftBody?.nft?.collection === 'string' ? nftBody.nft.collection : null
          const soft = (p) => p.catch(() => null) // degraded leg -> null field, not a failed sheet
          const [collectionBody, statsBody, offerBody] = collectionSlug
            ? await Promise.all([
                soft(client.get(`/api/v2/collections/${collectionSlug}`)),
                soft(client.get(`/api/v2/collections/${collectionSlug}/stats`)),
                soft(client.get(`/api/v2/offers/collection/${collectionSlug}/nfts/${identifier}/best`)),
              ])
            : [null, null, null]
          const detail = normalizeItemDetail({ nftBody, collectionBody, statsBody, offerBody }, chainId)
          if (!detail) throw new OpenSeaRequestError(404, 'item not present upstream')
          return detail
        }
      )
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/opensea/collections/:slug/stats ----------------------------------------------
  // Floor prices for the Portfolio estimate (US3) — longer TTL, floors move slowly.
  router.get('/v1/opensea/collections/:slug/stats', async (req, res) => {
    try {
      const { slug } = req.params
      if (!isSlug(slug)) throw new GatewayError(400, 'invalid_slug', 'collection slug must be lowercase alphanumeric/hyphen')
      guard(slug)

      const result = await cache.fetchThrough(`stats:${slug}`, os.statsCacheTtlMs, async () => {
        const statsBody = await client.get(`/api/v2/collections/${slug}/stats`)
        const { floorPrice } = normalizeCollection(slug, null, statsBody)
        return { slug, floorPrice }
      })
      respond(res, result)
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
