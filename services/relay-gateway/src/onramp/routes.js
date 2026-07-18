/**
 * Coinbase Onramp buy-crypto proxy routes — /v1/onramp/* (spec 060).
 *
 * Contract: specs/060-coinbase-onramp/contracts/gateway-api.md.
 * Pipeline per request: killswitch -> fail-closed credential check -> chain mapping -> param
 * validation -> destination sanctions screen (mints only) -> quota -> upstream call. The gateway
 * holds the CDP secret key and mints single-use hosted-session tokens (secure init); clients only
 * ever see the finished pay.coinbase.com URL. Nothing here touches intents, funds, or signing
 * keys — a total outage leaves every value path intact (FR-012), and absent credentials mean the
 * SPA hides the Buy button entirely (zero residual UI, FR-007).
 */
import express from 'express'
import { GatewayError } from '../errors.js'
import { OnrampRequestError } from './client.js'
import { slugForChain } from './chains.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const ASSET_RE = /^[A-Z0-9]{2,12}$/
const OPTIONS_CACHE_KEY = 'onramp:options'

/**
 * The chain whose sanctions guard screens an onramp destination. The guard consults an
 * address-based (chain-agnostic) sanctions list, but it is only deployed on gateway-enabled
 * chains — so screen on the requested chain when enabled, else on the first enabled chain
 * carrying a guard (e.g. buying on Ethereum mainnet screens via the Polygon guard). No guard
 * anywhere => null, and the mint fails CLOSED (screening_unavailable).
 */
export function screeningChainFor(config, chainId) {
  if (config.chains[chainId]?.sanctionsGuard) return chainId
  for (const id of config.enabledChainIds) {
    if (config.chains[id]?.sanctionsGuard) return id
  }
  return null
}

/**
 * @param {object} config full gateway config (only .onramp, .chains, .enabledChainIds are read)
 * @param {{
 *   client: {fetchBuyOptions: Function, createSessionToken: Function},
 *   cache: {fetchThrough: Function},
 *   quotas: {hit: Function},
 *   killSwitch: {isActive: () => boolean},
 *   screen: {screen: Function},
 * }} deps
 */
export function createOnrampRouter(config, { client, cache, quotas, killSwitch, screen }) {
  const onramp = config.onramp
  const router = express.Router()

  /** Killswitch + fail-closed credential check (shared by reads and mints). */
  function requireLive() {
    if (killSwitch.isActive()) {
      throw new GatewayError(503, 'killswitch_active', 'the gateway is temporarily disabled; try again later')
    }
    if (!onramp.apiKeyId || !onramp.apiKeySecret) {
      throw new GatewayError(503, 'onramp_unconfigured', 'buying crypto is not configured on this gateway')
    }
  }

  function guard(quotaKey) {
    requireLive()
    const q = quotas.hit(quotaKey)
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} onramp quota exceeded`, { retryAfterSec: q.retryAfterSec })
    }
  }

  /** Mapped mainnet or 400 unsupported_chain (testnets/ETC family can never onramp). */
  function requireSlug(chainIdParam) {
    const chainId = Number.parseInt(String(chainIdParam), 10)
    const slug = Number.isInteger(chainId) ? slugForChain(chainId) : null
    if (!slug) {
      throw new GatewayError(400, 'unsupported_chain', 'buying crypto is not available on this network')
    }
    return { chainId, slug }
  }

  /** Cached Buy Options catalog (slug -> tickers). Serves stale on upstream failure. */
  const cachedOptions = () => cache.fetchThrough(OPTIONS_CACHE_KEY, onramp.optionsCacheTtlMs, () => client.fetchBuyOptions())

  const availabilityFor = (bySlug, slug) => {
    const assets = bySlug?.[slug] ?? []
    return {
      available: assets.length > 0,
      assets,
      defaultAsset: assets.includes(onramp.defaultAsset) ? onramp.defaultAsset : (assets[0] ?? null),
    }
  }

  function handleError(res, err) {
    if (err instanceof GatewayError) {
      if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json(err.toBody())
    }
    if (err instanceof OnrampRequestError) {
      // Definitive upstream 4xx (e.g. Coinbase rejected the destination/asset) — surfaced as a
      // clean decline; the SPA renders the honest unavailable state, never a dead retry loop.
      return res.status(502).json({ error: { code: 'upstream_rejected', reason: 'coinbase declined this purchase request' } })
    }
    // OnrampUnavailableError and anything unexpected: degraded, nothing cached to serve.
    return res
      .status(502)
      .json({ error: { code: 'upstream_error', reason: 'the purchase service is temporarily unavailable; try again later' } })
  }

  // ---- GET /v1/onramp/options?chainId= --------------------------------------------------------
  // Dynamic availability layer: whether Coinbase currently lists the chain, and which assets it
  // can deliver there. The SPA hides the Buy button until this confirms the chain (FR-006).
  router.get('/v1/onramp/options', async (req, res) => {
    try {
      const { chainId, slug } = requireSlug(req.query.chainId)
      guard(`options:${chainId}`)
      const result = await cachedOptions()
      res.json({
        chainId,
        ...availabilityFor(result.value, slug),
        fetchedAt: new Date(result.fetchedAt).toISOString(),
        stale: result.stale,
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- POST /v1/onramp/session ----------------------------------------------------------------
  // Mints a single-use hosted-session token for one validated, screened destination and returns
  // the finished hosted URL. Validation order per contracts/gateway-api.md; the token is never
  // cached, never retried, and never logged.
  router.post('/v1/onramp/session', async (req, res) => {
    try {
      requireLive()
      const body = req.body ?? {}
      const address = typeof body.address === 'string' ? body.address : ''
      if (!ADDRESS_RE.test(address)) {
        throw new GatewayError(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address')
      }
      const { chainId, slug } = requireSlug(body.chainId)
      const asset = typeof body.asset === 'string' ? body.asset.toUpperCase() : ''
      if (!ASSET_RE.test(asset)) {
        throw new GatewayError(400, 'unsupported_asset', 'asset must be a Coinbase asset ticker')
      }

      // Live catalog re-validation at mint time — always a fresh fetch (mints are rare and
      // quota-bounded, so bypassing the cache is cheap) so a delisting or listing between the
      // sheet rendering and the tap is honored rather than minting a dead session (spec US2
      // edge case). Coinbase unreachable => fall back to the cached catalog (best-effort
      // freshness; Coinbase itself re-checks eligibility inside the hosted flow).
      let bySlug
      try {
        bySlug = await client.fetchBuyOptions()
      } catch {
        bySlug = (await cachedOptions()).value
      }
      if (!availabilityFor(bySlug, slug).assets.includes(asset)) {
        throw new GatewayError(400, 'unsupported_asset', 'coinbase cannot deliver this asset on this network right now')
      }

      // Destination sanctions screen — fail closed, same posture as the intent path (FR-004's
      // compliance story: FairWins never learns about the payment, but never onramps to an
      // address its own guard would reject). screen() throws 403 sanctioned_signer / 503
      // screening_unavailable; a missing guard everywhere is the latter.
      const screenChain = screeningChainFor(config, chainId)
      if (screenChain == null) {
        throw new GatewayError(503, 'screening_unavailable', 'sanctions screening is required but not configured')
      }
      try {
        await screen.screen(screenChain, address)
      } catch (e) {
        // The shared screen speaks in signer terms; this is a destination — rename the refusal
        // to the contract's `screened` code, keep the fail-closed 503 as-is.
        if (e instanceof GatewayError && e.code === 'sanctioned_signer') {
          throw new GatewayError(403, 'screened', 'destination address failed sanctions screening')
        }
        throw e
      }

      // Per-destination + global mint quota (after validation so probes can't burn the budget).
      const q = quotas.hit(address.toLowerCase())
      if (!q.allowed) {
        throw new GatewayError(429, 'quota_exceeded', `${q.scope} onramp quota exceeded`, { retryAfterSec: q.retryAfterSec })
      }

      const token = await client.createSessionToken({ address, slug, asset })
      const url =
        `${onramp.hostedBaseUrl}?sessionToken=${encodeURIComponent(token)}` +
        `&defaultNetwork=${encodeURIComponent(slug)}&defaultAsset=${encodeURIComponent(asset)}`
      res.json({ url })
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
