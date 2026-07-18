/**
 * Coinbase Developer Platform (CDP) Onramp API client for the /v1/onramp/* buy-crypto proxy
 * (spec 060, research R2/R3).
 *
 * Mirrors src/polymarket/client.js: thin fetch adapter with a bounded timeout, an injectable
 * fetchImpl for tests, retries on 5xx/transport for reads (`fetchBuyOptions`), and NO retry for
 * `createSessionToken` — session tokens are single-use, so a retry after an ambiguous failure
 * could strand a minted token and trip Coinbase-side anomaly limits.
 *
 * Auth: every CDP request carries a short-lived JWT bearer built from the CDP secret API key
 * (CDP_API_KEY_ID / CDP_API_KEY_SECRET) by the official `@coinbase/cdp-sdk` helper — the claim
 * shape (audience, uris, expiry) is Coinbase-specified and hand-rolling it around raw key
 * material is avoidable crypto surface (research R3). The key never leaves this process and the
 * minted session token is returned to routes.js only inside the finished hosted URL — neither is
 * ever logged.
 */

/** Coinbase unreachable / persistent 5xx / upstream 429 — routes serve stale options or 502. */
export class OnrampUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'OnrampUnavailableError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (bad address, unsupported asset) — not retried, not cache-maskable. */
export class OnrampRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'OnrampRequestError'
    this.status = status
  }
}

import { normalizeNetworkKey } from './chains.js'

/**
 * Normalize the Buy Options catalog to the per-network shape the routes serve: for each
 * network, Coinbase's own reported name (echoed back verbatim in mint requests and hosted
 * URLs) plus the asset tickers deliverable there. Keys are spelling-insensitive
 * (normalizeNetworkKey) so our canonical slug matches whatever variant Coinbase uses
 * ("ethereum-classic" vs "ethereumclassic"). Tolerant of missing fields — an unusable entry
 * is dropped, never a 500.
 * @param {{purchase_currencies?: Array<{symbol?: string, networks?: Array<{name?: string}>}>}} body
 * @returns {Record<string, {name: string, assets: string[]}>} normalized key -> network entry
 */
export function normalizeBuyOptions(body) {
  const byKey = {}
  for (const cur of body?.purchase_currencies ?? []) {
    const symbol = typeof cur?.symbol === 'string' ? cur.symbol.toUpperCase() : null
    if (!symbol) continue
    for (const net of cur?.networks ?? []) {
      const name = typeof net?.name === 'string' ? net.name.toLowerCase() : null
      if (!name) continue
      const key = normalizeNetworkKey(name)
      if (!key) continue
      ;(byKey[key] ??= { name, assets: [] }).assets.push(symbol)
    }
  }
  for (const key of Object.keys(byKey)) byKey[key].assets = [...new Set(byKey[key].assets)].sort()
  return byKey
}

/**
 * @param {{apiKeyId: string, apiKeySecret: string, baseUrl: string, country?: string,
 *   timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch,
 *   generateJwtImpl?: (opts: object) => Promise<string>}} opts
 *   `generateJwtImpl` is injectable for tests; the default lazy-loads the official helper.
 */
export function createOnrampClient({
  apiKeyId,
  apiKeySecret,
  baseUrl,
  country = 'US',
  timeoutMs = 5000,
  retries = 1,
  fetchImpl = fetch,
  generateJwtImpl = null,
}) {
  const base = baseUrl.replace(/\/+$/, '')
  const host = new URL(base).host

  const jwtFor = async (method, path) => {
    const generate =
      generateJwtImpl ?? (await import('@coinbase/cdp-sdk/auth')).generateJwt
    return generate({
      apiKeyId,
      apiKeySecret,
      requestMethod: method,
      requestHost: host,
      requestPath: path,
      expiresIn: 120,
    })
  }

  const doFetch = async (method, path, body) => {
    const jwt = await jwtFor(method, path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${base}${path}${method === 'GET' && country ? `?country=${encodeURIComponent(country)}` : ''}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${jwt}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })
      if (res.status >= 500 || res.status === 429) {
        throw new OnrampUnavailableError(`coinbase returned ${res.status}`)
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // 4xx bodies may echo request fields but never the (not-yet-minted) token; safe to surface trimmed.
        throw new OnrampRequestError(res.status, `coinbase rejected request (${res.status}): ${text.slice(0, 200)}`)
      }
      return await res.json()
    } catch (e) {
      if (e instanceof OnrampRequestError || e instanceof OnrampUnavailableError) throw e
      throw new OnrampUnavailableError(`coinbase unreachable: ${e?.message || e}`, e)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /**
     * Buy Options catalog → { bySlug } (see normalizeBuyOptions). Retried on 5xx/transport;
     * routes cache this and serve stale on failure.
     */
    async fetchBuyOptions() {
      let lastErr
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return normalizeBuyOptions(await doFetch('GET', '/onramp/v1/buy/options'))
        } catch (e) {
          if (e instanceof OnrampRequestError) throw e
          lastErr = e
        }
      }
      throw lastErr instanceof OnrampUnavailableError
        ? lastErr
        : new OnrampUnavailableError(`coinbase unreachable after ${retries + 1} attempts`, lastErr)
    },

    /**
     * Mint a single-use hosted-session token for one destination. NEVER retried (single-use
     * token; an ambiguous failure must surface, not double-mint). Returns the raw token string.
     * @param {{address: string, slug: string, asset: string}} args
     */
    async createSessionToken({ address, slug, asset }) {
      const body = {
        addresses: [{ address, blockchains: [slug] }],
        assets: [asset],
      }
      const res = await doFetch('POST', '/onramp/v1/token', body)
      const token = res?.token ?? res?.data?.token
      if (typeof token !== 'string' || token.length === 0) {
        throw new OnrampUnavailableError('coinbase returned no session token')
      }
      return token
    },
  }
}
