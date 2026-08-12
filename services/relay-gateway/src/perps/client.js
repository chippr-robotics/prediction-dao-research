/**
 * Venue HTTP clients for the /v1/perps/* read proxy (spec 082).
 *
 * Mirrors src/polymarket/client.js: thin fetch adapters with a bounded timeout, an injectable
 * fetchImpl for tests, and retries on 5xx/429 for READS only. There are no writes anywhere in this
 * module — the perps proxy is read-only by design (FR-018: no in-app execution this release), so
 * every request is idempotent and safe to retry. Hyperliquid's info endpoint is a POST that is
 * semantically a read (the body is a query), so it retries like a GET.
 *
 * No credentials exist here: all three venues serve public, unauthenticated market data
 * (research D2). Member addresses appear only in position queries and never leave the gateway
 * logs' standard request path.
 */

/** Venue unreachable / persistent 5xx / upstream 429 — routes degrade that venue, never the rest. */
export class PerpsUpstreamError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'PerpsUpstreamError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (bad path, unknown resource) — not retried. */
export class PerpsRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'PerpsRequestError'
    this.status = status
  }
}

/**
 * One venue-agnostic JSON client. `get` and `postRead` both retry (reads only, see header).
 *
 * @param {{baseUrl: string, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createVenueClient({ baseUrl, timeoutMs = 8000, retries = 1, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, '')

  async function request(path, init) {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}${path}`, { ...init, signal: controller.signal })
        if (res.status >= 500 || res.status === 429) {
          lastErr = new PerpsUpstreamError(`venue returned ${res.status}`)
          continue
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new PerpsRequestError(res.status, `venue rejected request (${res.status}): ${text.slice(0, 200)}`)
        }
        return await res.json()
      } catch (e) {
        if (e instanceof PerpsRequestError) throw e
        lastErr = e
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr instanceof PerpsUpstreamError
      ? lastErr
      : new PerpsUpstreamError(`venue unreachable after ${retries + 1} attempts`, lastErr)
  }

  return {
    /** GET a JSON path with optional query params. */
    async get(path, { query = {} } = {}) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))
      return request(`${path}${qs.size > 0 ? `?${qs}` : ''}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      })
    },

    /** POST a JSON body that is semantically a READ (Hyperliquid /info) — retried like a GET. */
    async postRead(path, body) {
      return request(path, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
  }
}

/**
 * The venue client set the routes consume. A venue with no configured base URL is absent from the
 * map and omitted from `sources` entirely — "operator chose not to serve it" is a different fact
 * from an outage, which IS reported as `degraded` (honest-state, FR-004).
 *
 * @param {object} perpsConfig config.perps
 * @param {{fetchImpl?: typeof fetch}} [opts]
 */
export function createPerpsClients(perpsConfig, { fetchImpl } = {}) {
  const mk = (baseUrl) =>
    baseUrl
      ? createVenueClient({
          baseUrl,
          timeoutMs: perpsConfig.timeoutMs,
          retries: perpsConfig.retries,
          ...(fetchImpl ? { fetchImpl } : {}),
        })
      : null

  return {
    // Gains Network runs one backend per chain; each serves that chain's pairs/state.
    gains: Object.fromEntries(
      Object.entries(perpsConfig.gainsUrls)
        .filter(([, url]) => Boolean(url))
        .map(([chainId, url]) => [chainId, mk(url)]),
    ),
    // The Gains pricing feed is global (one pair universe shared across chains).
    gainsPricing: mk(perpsConfig.gainsPricingUrl),
    gmx: mk(perpsConfig.gmxUrl),
    hyperliquid: mk(perpsConfig.hlUrl),
  }
}
