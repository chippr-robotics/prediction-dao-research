/**
 * Perps gateway client (spec 082) — the SPA side of the relay-gateway's /v1/perps/* read proxy.
 * Public market data only: merged pairs, the connected address's positions, and the public
 * attribution/fee config. Soft-fail by design: with VITE_RELAYER_URL unset the feature reports
 * unavailable and the Perps view renders one honest notice (FR-013) — mirroring predictClient.
 *
 * There are NO write calls anywhere in this module — no in-app execution ships this release
 * (FR-018); trading happens on the venue via attributed link-outs (lib/perps/linkouts.js).
 */
import { perpsGatewayUrl } from '../../config/perps'

const FETCH_TIMEOUT_MS = 12_000

/** Transport failure, timeout, 5xx, killswitch, or quota exhaustion — callers show the degraded state. */
export class PerpsUnavailable extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'PerpsUnavailable'
    this.code = code || 'unavailable'
    if (cause !== undefined) this.cause = cause
  }
}

async function request(path, { fetchImpl = fetch } = {}) {
  const base = perpsGatewayUrl()
  if (!base) throw new PerpsUnavailable('perps gateway is not configured', { code: 'unconfigured' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res
  try {
    res = await fetchImpl(`${base}${path}`, { signal: controller.signal })
  } catch (e) {
    throw new PerpsUnavailable(`perps gateway unreachable: ${e?.message || e}`, {
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
  const err = new PerpsUnavailable(errBody?.error?.reason || `perps request failed (${res.status})`, { code })
  err.status = res.status
  throw err
}

/** Merged pairs across venues → { pairs, sources, asOf }. */
export function fetchPerpPairs(opts = {}) {
  return request('/v1/perps/pairs', opts)
}

/** The connected address's open positions per venue → { positions, sources }. */
export function fetchPerpPositions(address, opts = {}) {
  return request(`/v1/perps/positions?address=${encodeURIComponent(address)}`, opts)
}

/**
 * Public attribution + Hyperliquid builder-fee config → { attribution, hyperliquidBuilderFee }.
 * Callers treat a throw as "fee unconfirmed" and say so — never silently substitute a number
 * (FR-010).
 */
export function fetchPerpsConfig(opts = {}) {
  return request('/v1/perps/config', opts)
}
