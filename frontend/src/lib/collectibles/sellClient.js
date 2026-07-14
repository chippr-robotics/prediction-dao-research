/**
 * Sell-side gateway client (spec 056) — the SPA side of the relay-gateway write routes
 * (specs/056-collectibles-sell-side/contracts/gateway-sell-api.md). Extends the 055 read client's
 * conventions: `VITE_RELAYER_URL` base, bounded fetch, no client-held credential (only the edge
 * `X-Origin-Auth`), outages mapped to `CollectiblesUnavailable` so the UI degrades honestly.
 *
 * `409 offer_changed` is surfaced as its own code so the accept flow re-confirms the current best
 * offer rather than settling stale (FR-007).
 */
import { collectiblesGatewayUrl, CollectiblesUnavailable } from './gatewayClient'

const FETCH_TIMEOUT_MS = 15_000

async function request(path, { method = 'GET', body } = {}) {
  const base = collectiblesGatewayUrl()
  if (!base) throw new CollectiblesUnavailable('collectibles gateway is not configured', { code: 'unconfigured' })

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
    throw new CollectiblesUnavailable(`collectibles gateway unreachable: ${e?.message || e}`, {
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
  const err = new CollectiblesUnavailable(errBody?.error?.reason || `sell request failed (${res.status})`, { code })
  err.status = res.status
  throw err
}

/** Live fee basis for a listing/net-proceeds display (FR-002). Throws when unavailable → block signing. */
export function fetchRequiredFees(chainId, slug) {
  return request(`/v1/opensea/${chainId}/collections/${encodeURIComponent(slug)}/required-fees`)
}

/** Publish a client-signed Seaport listing → { orderHash, listing, referral }. */
export function publishListing(chainId, { order, signature, protocolAddress }) {
  return request(`/v1/opensea/${chainId}/listings`, { method: 'POST', body: { order, signature, protocolAddress } })
}

/** Cancel a listing → { cancelled, method: 'offchain'|'onchain', protocolAddress? } (FR-008). */
export function cancelListing(chainId, { orderHash, offerer, signature }) {
  return request(`/v1/opensea/${chainId}/listings/cancel`, { method: 'POST', body: { orderHash, offerer, signature } })
}

/**
 * Get the transaction to accept an offer → { to, data, value, orderHash, referral }.
 * A `409 offer_changed` becomes a `CollectiblesUnavailable` with code `offer_changed` so the caller
 * re-confirms the current best offer (FR-007).
 */
export function fetchOfferFulfillment(chainId, { orderHash, fulfiller }) {
  return request(`/v1/opensea/${chainId}/offers/fulfillment`, { method: 'POST', body: { orderHash, fulfiller } })
}
