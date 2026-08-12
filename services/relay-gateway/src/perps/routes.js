/**
 * Perps read proxy routes — /v1/perps/* (spec 082).
 *
 * Contract: specs/082-perps-trade-view/contracts/gateway-perps-api.md.
 * Pipeline per request: killswitch -> enabled check -> param validation -> quota -> per-venue
 * cached fetch. READ-ONLY by design: there is no write route in this module (FR-018 — no in-app
 * execution this release), so a total outage leaves every value path intact (FR-016).
 *
 * The core rule is PER-VENUE ISOLATION (FR-004): each venue resolves independently to
 * read|degraded via its own cache key; a degraded venue contributes no rows and is reported in
 * `sources` — it never blanks the others and never renders as zeros. Serve-stale is bounded:
 * the TTL cache marks stale values, and anything older than STALE_FACTOR x TTL degrades instead.
 */
import express from 'express'
import { GatewayError } from '../errors.js'
import {
  isAddress,
  normalizeGainsPairs,
  normalizeGainsPendingOrders,
  normalizeGainsPositions,
  normalizeGmxPairs,
  normalizeHyperliquidPairs,
  normalizeHyperliquidPositions,
} from './normalize.js'

const STALE_FACTOR = 10 // a cached value older than 10x TTL is treated as gone, not served

/**
 * @param {object} config full gateway config (only .perps and .feeRouter are read)
 * @param {{
 *   clients: {gains: Record<string, object>, gainsPricing: object|null, gmx: object|null, hyperliquid: object|null},
 *   cache: {fetchThrough: Function},
 *   quotas: {hit: Function},
 *   killSwitch: {isActive: () => boolean},
 *   feeRates?: {getPerpsHlBuilderBps: () => Promise<number|null>} | null,
 *   now?: () => number,
 * }} deps
 */
export function createPerpsRouter(config, { clients, cache, quotas, killSwitch, feeRates = null, now = Date.now }) {
  const perps = config.perps
  const router = express.Router()

  function requireLive() {
    // Module killswitch first (the bitcoin/bridge convention), then the global one.
    if (perps.killSwitch) {
      throw new GatewayError(503, 'perps_killed', 'perps market data is temporarily disabled; try again later')
    }
    if (killSwitch.isActive()) {
      throw new GatewayError(503, 'killswitch_active', 'the gateway is temporarily disabled; try again later')
    }
    if (!perps.enabled) {
      throw new GatewayError(503, 'perps_unconfigured', 'perps market data is not configured on this gateway')
    }
  }

  /**
   * Total-outage honesty (contract: 502 upstream_failed only when EVERY venue fails): a 200 with
   * empty rows must always mean "the venues answered and this is what exists", never "nothing was
   * reachable" — the SPA maps the 502 to its honest unavailable state instead of an empty table.
   */
  function requireAnyRead(sources) {
    const entries = Object.values(sources)
    if (entries.length > 0 && !entries.some((s) => s?.status === 'read')) {
      throw new GatewayError(502, 'upstream_failed', 'no perps venue is reachable right now; try again later')
    }
  }

  // Quotas are keyed per caller IP (nothing to sign on a GET) — same convention as the
  // bitcoin/bridge read proxies.
  const quotaKey = (req) => req.ip ?? 'unknown'

  function guard(req) {
    requireLive()
    const q = quotas.hit(quotaKey(req))
    if (!q.allowed) {
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} perps read quota exceeded`, {
        retryAfterSec: q.retryAfterSec,
      })
    }
  }

  function handleError(res, err) {
    if (err instanceof GatewayError) {
      if (err.retryAfterSec != null) res.set('Retry-After', String(err.retryAfterSec))
      return res.status(err.status).json(err.toBody())
    }
    return res
      .status(503)
      .json({ error: { code: 'upstream_unavailable', reason: 'perps market data is temporarily unavailable; try again later' } })
  }

  /**
   * Cached per-venue fetch that maps failure to `null` instead of throwing, so one venue's outage
   * never fails the merged response. Bounded staleness: a stale cache hit past STALE_FACTOR x TTL
   * counts as an outage (stale-as-live would be dishonest, FR-004).
   */
  async function venueRead(key, loader) {
    try {
      const result = await cache.fetchThrough(key, perps.cacheTtlMs, loader)
      if (result.stale && now() - result.fetchedAt > perps.cacheTtlMs * STALE_FACTOR) return null
      return result
    } catch {
      return null
    }
  }

  /** Gains needs the (large) trading-variables payload for pairs, positions and scaling context. */
  const gainsTvRead = (chainId) =>
    venueRead(`gains-tv:${chainId}`, () => clients.gains[chainId].get('/trading-variables'))

  /**
   * Gains per-member state: `pendingMarketOrders` / `pendingMarketOrdersIds` (spec 083) — the
   * stuck-order recovery surface. Cached per (chain, address) like the open-trades read.
   */
  const gainsUserTvRead = (chainId, address) =>
    venueRead(`gains-utv:${chainId}:${address.toLowerCase()}`, () =>
      clients.gains[chainId].get(`/user-trading-variables/${address}`),
    )

  /** The gains pricing feed is one global snapshot (pair universe is shared across chains). */
  const gainsPricesRead = () =>
    clients.gainsPricing ? venueRead('gains-prices', () => clients.gainsPricing.get('/charts')) : Promise.resolve(null)

  // ---- GET /v1/perps/pairs ------------------------------------------------------------------
  router.get('/v1/perps/pairs', async (req, res) => {
    try {
      guard(req)

      const gainsChainIds = Object.keys(clients.gains)
      const [gainsPrices, ...gainsTvs] = await Promise.all([gainsPricesRead(), ...gainsChainIds.map(gainsTvRead)])

      const gmxResult = clients.gmx
        ? await venueRead('gmx-pairs', async () => {
            const [marketsInfo, tickers, tokens] = await Promise.all([
              clients.gmx.get('/markets/info'),
              clients.gmx.get('/prices/tickers'),
              clients.gmx.get('/tokens'),
            ])
            return { marketsInfo, tickers, tokens }
          })
        : null

      const hlResult = clients.hyperliquid
        ? await venueRead('hl-pairs', () => clients.hyperliquid.postRead('/info', { type: 'metaAndAssetCtxs' }))
        : null

      const pairs = []
      const sources = {}

      if (gainsChainIds.length > 0) {
        const okChains = []
        let anyStale = false
        gainsChainIds.forEach((chainId, i) => {
          const tv = gainsTvs[i]
          if (!tv) return
          okChains.push(Number(chainId))
          if (tv.stale) anyStale = true
          pairs.push(
            ...normalizeGainsPairs({
              tradingVariables: tv.value,
              chartPrices: gainsPrices?.value ?? null,
              chainId: Number(chainId),
            }),
          )
        })
        sources.gains = { status: okChains.length > 0 ? 'read' : 'degraded', chains: okChains, stale: anyStale }
      }

      if (clients.gmx) {
        if (gmxResult) {
          pairs.push(...normalizeGmxPairs({ ...gmxResult.value, chainId: perps.gmxChainId }))
          sources.gmx = { status: 'read', chains: [perps.gmxChainId], stale: Boolean(gmxResult.stale) }
        } else {
          sources.gmx = { status: 'degraded', chains: [], stale: false }
        }
      }

      if (clients.hyperliquid) {
        if (hlResult) {
          pairs.push(...normalizeHyperliquidPairs({ metaAndAssetCtxs: hlResult.value }))
          sources.hyperliquid = { status: 'read', chains: [], stale: Boolean(hlResult.stale) }
        } else {
          sources.hyperliquid = { status: 'degraded', chains: [], stale: false }
        }
      }

      requireAnyRead(sources)
      res.json({ pairs, sources, asOf: new Date(now()).toISOString() })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/perps/positions?address=0x… --------------------------------------------------
  // Read-only, per-venue isolated. GMX positions are NOT served here: the GMX REST API does not
  // expose them and they are read client-side from GMX's Reader contract (spec 083 T032) — the
  // venue stays honestly ABSENT from `sources` rather than being invented in the gateway.
  //
  // Spec 083 adds `pendingOrders` to THIS response rather than a sibling route, deliberately:
  // positions and pending orders are one screen and one member fact. Two routes would mean two
  // quota hits, two independent staleness windows, and two `sources` maps that can disagree — the
  // UI could then show "gains: read" positions while the member's stuck order silently 502'd, which
  // is exactly the invisibility this surface exists to prevent. Older clients ignore the new array.
  router.get('/v1/perps/positions', async (req, res) => {
    try {
      const address = typeof req.query.address === 'string' ? req.query.address : ''
      if (!isAddress(address)) {
        throw new GatewayError(400, 'invalid_address', 'address must be a 0x-prefixed 20-byte hex address')
      }
      guard(req)
      const addr = address.toLowerCase()

      const gainsChainIds = Object.keys(clients.gains)
      const gainsReads = await Promise.all(
        gainsChainIds.map(async (chainId) => {
          const [tv, open, userTv] = await Promise.all([
            gainsTvRead(chainId),
            venueRead(`gains-open:${chainId}:${addr}`, () => clients.gains[chainId].get(`/open-trades/${address}`)),
            gainsUserTvRead(chainId, address),
          ])
          return {
            chainId: Number(chainId),
            tv: tv?.value ?? null,
            open: open?.value ?? null,
            userTv: userTv?.value ?? null,
            // The two facets resolve INDEPENDENTLY. Positions need the trading variables for their
            // scales; pending orders do not (an order with a null symbol is still recoverable), so
            // a trading-variables outage must never withhold a recovery handle (exits are never
            // gated — not by a flag, not by an outage).
            positionsOk: Boolean(tv && open),
            pendingOk: Boolean(userTv),
          }
        }),
      )

      const hlResult = clients.hyperliquid
        ? await venueRead(`hl-positions:${addr}`, () =>
            clients.hyperliquid.postRead('/info', { type: 'clearinghouseState', user: address }),
          )
        : null

      const positions = []
      // Gains is the only venue contributing pending orders: GMX orders are read client-side with
      // its Reader, and Hyperliquid's resting orders are out of scope for this release.
      const pendingOrders = []
      const sources = {}

      if (gainsChainIds.length > 0) {
        const okChains = []
        const pendingOrderChains = []
        for (const read of gainsReads) {
          if (read.positionsOk) {
            okChains.push(read.chainId)
            positions.push(
              ...normalizeGainsPositions({ openTrades: read.open, tradingVariables: read.tv, chainId: read.chainId }),
            )
          }
          if (read.pendingOk) {
            pendingOrderChains.push(read.chainId)
            pendingOrders.push(
              ...normalizeGainsPendingOrders({
                userTradingVariables: read.userTv,
                tradingVariables: read.tv,
                chainId: read.chainId,
              }),
            )
          }
        }
        // `chains` is the POSITION facet (unchanged for spec-082 clients); `pendingOrderChains` is
        // the recovery facet. A chain present in one and missing from the other says "this fact is
        // unknown here" — an empty `pendingOrders` for a chain that never answered must not read as
        // "you have no stuck orders".
        sources.gains = { status: okChains.length > 0 ? 'read' : 'degraded', chains: okChains, pendingOrderChains }
      }

      if (clients.hyperliquid) {
        if (hlResult) {
          positions.push(...normalizeHyperliquidPositions({ clearinghouseState: hlResult.value }))
          sources.hyperliquid = { status: 'read', chains: [], stale: Boolean(hlResult.stale) }
        } else {
          sources.hyperliquid = { status: 'degraded', chains: [], stale: false }
        }
      }

      // The total-outage 502 stands — with one exception: if we DID reach a member's pending
      // orders, a 502 would bury a recovery handle behind an error screen. Exits are never gated,
      // and an outage is not an exception to that; the honest answer is the orders plus a `sources`
      // map that says which reads failed.
      if (pendingOrders.length === 0) requireAnyRead(sources)
      res.json({ positions, pendingOrders, sources, asOf: new Date(now()).toISOString() })
    } catch (err) {
      handleError(res, err)
    }
  })

  // ---- GET /v1/perps/config -----------------------------------------------------------------
  // Public attribution identifiers + the live Hyperliquid builder-fee bps. Since spec 060 the bps
  // come LIVE from the FeeRouter (`perps.hyperliquid.builder`, admin-editable on-chain); the env
  // value is the honest fallback when the router is unset/unreachable. Never contains secrets.
  router.get('/v1/perps/config', async (req, res) => {
    try {
      guard(req)
      const live = feeRates ? await feeRates.getPerpsHlBuilderBps() : null
      res.json({
        attribution: {
          gains: { referrer: perps.gainsReferrer ?? null },
          gmx: { refCode: perps.gmxRefCode ?? null },
          hyperliquid: { builderAddress: perps.hlBuilderAddress ?? null },
        },
        hyperliquidBuilderFee: {
          bps: live ?? perps.hlBuilderFeeBps,
          capBps: perps.hlBuilderFeeCapBps,
          source: live != null ? 'chain' : 'env-fallback',
        },
      })
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}

/** /status contribution (FR-014): operational visibility, no member data. */
export function perpsStatus(config, { killSwitch }) {
  const perps = config.perps
  return {
    // Honest liveness: the module is "enabled" only if a request right now would be served —
    // the module killswitch counts as much as the global one.
    enabled: Boolean(perps.enabled) && !perps.killSwitch && !killSwitch.isActive(),
    venues: {
      gains: Object.entries(perps.gainsUrls)
        .filter(([, url]) => Boolean(url))
        .map(([chainId]) => Number(chainId)),
      gmx: Boolean(perps.gmxUrl),
      hyperliquid: Boolean(perps.hlUrl),
    },
    attribution: {
      gains: Boolean(perps.gainsReferrer),
      gmx: Boolean(perps.gmxRefCode),
      hyperliquid: Boolean(perps.hlBuilderAddress),
    },
    hlBuilderFeeBpsFallback: perps.hlBuilderFeeBps,
  }
}
