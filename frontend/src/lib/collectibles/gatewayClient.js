/**
 * Collectibles gateway client (spec 055) — the SPA side of the relay-gateway's read-only
 * /v1/opensea/* proxy (specs/055-collectibles-portfolio/contracts/gateway-opensea-api.md).
 *
 * The OpenSea API key lives ONLY in the gateway (FR-009); this client sends no auth material
 * of its own (the Cloudflare edge injects X-Origin-Auth in transit, like the relay client).
 * Soft-fail by design: with VITE_RELAYER_URL unset the feature reports unavailable and every
 * collectibles surface hides (FR-007) — mirroring makeRelayer()'s null return.
 */
import { getNetwork } from '../../config/networks'

const FETCH_TIMEOUT_MS = 10_000
// A 429 with a short Retry-After is worth one polite retry; anything longer degrades
// immediately — a browse screen must not sit on a dead spinner (FR-008).
const MAX_RETRY_AFTER_MS = 2_000

/** Transport failure, timeout, 5xx, or quota exhaustion — callers show the degraded state (FR-008). */
export class CollectiblesUnavailable extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'CollectiblesUnavailable'
    this.code = code || 'unavailable'
    if (cause !== undefined) this.cause = cause
  }
}

/** The configured gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function collectiblesGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Whether the collectibles feature exists at all for this chain: OpenSea must serve the network
 * (capability flag, Ethereum + Polygon only) AND a gateway must be configured to proxy the reads.
 * False hides the tab and the portfolio line entirely (FR-007 / SC-003).
 */
export function collectiblesAvailable(chainId) {
  return Boolean(getNetwork(chainId)?.capabilities?.collectibles) && collectiblesGatewayUrl() !== ''
}

async function getJson(path) {
  const base = collectiblesGatewayUrl()
  if (!base) throw new CollectiblesUnavailable('collectibles gateway is not configured', { code: 'unconfigured' })

  const attempt = async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      return await fetch(`${base}${path}`, { method: 'GET', signal: controller.signal })
    } catch (e) {
      throw new CollectiblesUnavailable(`collectibles gateway unreachable: ${e?.message || e}`, {
        code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
        cause: e,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let res = await attempt()
  if (res.status === 429) {
    const retryAfterMs = Number(res.headers?.get?.('retry-after') ?? NaN) * 1000
    if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0 && retryAfterMs <= MAX_RETRY_AFTER_MS) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
      res = await attempt()
    }
  }

  if (res.ok) return res.json()

  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error body — fall through to the generic mapping */
  }
  const code = body?.error?.code || `http_${res.status}`
  // 404 unsupported_chain / not_found are honest verdicts the hook maps to hidden/empty states;
  // everything else on the read path means "temporarily unavailable".
  const err = new CollectiblesUnavailable(body?.error?.reason || `collectibles request failed (${res.status})`, { code })
  err.status = res.status
  throw err
}

/**
 * One page of the wallet's owned collectibles (US1).
 * @returns {Promise<{items: object[], next: string|null, fetchedAt: string, stale: boolean}>}
 */
export function fetchAccountCollectibles(chainId, address, next = null) {
  const cursor = next ? `?next=${encodeURIComponent(next)}` : ''
  return getJson(`/v1/opensea/${chainId}/account/${address}/nfts${cursor}`)
}

/**
 * Composed item detail: traits + collection (incl. floor) + best offer (US2).
 * @returns {Promise<object>} CollectibleItemDetail with {fetchedAt, stale}
 */
export function fetchCollectibleDetail(chainId, contract, identifier) {
  return getJson(`/v1/opensea/${chainId}/contract/${contract}/nfts/${identifier}`)
}

/**
 * A collection's floor price for the portfolio estimate (US3).
 * @returns {Promise<{slug: string, floorPrice: {amount: string, currency: string}|null, fetchedAt: string, stale: boolean}>}
 */
export function fetchCollectionStats(slug) {
  return getJson(`/v1/opensea/collections/${encodeURIComponent(slug)}/stats`)
}
