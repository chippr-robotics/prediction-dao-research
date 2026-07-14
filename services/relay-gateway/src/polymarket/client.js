/**
 * Polymarket CLOB REST client for the /v1/polymarket/* Predict proxy (spec 057).
 *
 * Mirrors src/opensea/client.js: thin fetch adapter with a bounded timeout, an injectable fetchImpl
 * for tests, retries on 5xx for reads (`get`), and NO retry for writes (`post`) — submitting an order
 * is not idempotent, so a retry could double-post.
 *
 * Auth is Polymarket's two-layer scheme. L1 (a one-time EIP-712 wallet signature) is done OFFLINE
 * during provisioning; this client only performs L2: an HMAC-SHA256 signature over
 * `{timestampSeconds}{METHOD}{path}{body}` with the base64url-decoded API secret, sent alongside the
 * key/passphrase/address headers. Public market reads work without creds; user-specific reads and
 * order/cancel writes set `{ auth: true }` and attach the L2 headers. The creds never leave this
 * process (FR-016).
 */
import crypto from 'node:crypto'

/** Polymarket unreachable / persistent 5xx / upstream 429 — routes serve stale or 503 upstream_unavailable. */
export class PolymarketUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'PolymarketUnavailableError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (unknown market, rejected order) — not retried, not maskable by cache. */
export class PolymarketRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'PolymarketRequestError'
    this.status = status
  }
}

/** L2 HMAC headers for one request, or {} when creds are absent (public read). Timestamp is SECONDS. */
export function l2Headers({ apiKey, apiSecret, apiPassphrase, apiAddress }, { method, path, body, nowSec }) {
  if (!apiKey || !apiSecret || !apiPassphrase) return {}
  const ts = String(nowSec)
  const message = `${ts}${method}${path}${body ?? ''}`
  const sig = crypto
    .createHmac('sha256', Buffer.from(apiSecret, 'base64url'))
    .update(message)
    .digest('base64url')
  return {
    POLY_ADDRESS: apiAddress ?? '',
    POLY_API_KEY: apiKey,
    POLY_PASSPHRASE: apiPassphrase,
    POLY_TIMESTAMP: ts,
    POLY_SIGNATURE: sig,
  }
}

/**
 * @param {{baseUrl: string, apiKey?: string|null, apiSecret?: string|null, apiPassphrase?: string|null,
 *   apiAddress?: string|null, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch,
 *   now?: () => number}} opts  `now` returns unix MILLISECONDS (default Date.now); we derive seconds.
 */
export function createPolymarketClient({
  baseUrl,
  apiKey = null,
  apiSecret = null,
  apiPassphrase = null,
  apiAddress = null,
  timeoutMs = 5000,
  retries = 1,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  const base = baseUrl.replace(/\/+$/, '')
  const creds = { apiKey, apiSecret, apiPassphrase, apiAddress }
  const nowSec = () => Math.floor(now() / 1000)

  return {
    /**
     * GET a CLOB path with optional query params. `auth` attaches L2 headers (user-specific reads).
     * @param {string} path
     * @param {{query?: Record<string,string>, auth?: boolean}} [opts]
     */
    async get(path, { query = {}, auth = false } = {}) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))
      const fullPath = `${path}${qs.size > 0 ? `?${qs}` : ''}`
      let lastErr
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const res = await fetchImpl(`${base}${fullPath}`, {
            method: 'GET',
            headers: {
              accept: 'application/json',
              ...(auth ? l2Headers(creds, { method: 'GET', path: fullPath, body: '', nowSec: nowSec() }) : {}),
            },
            signal: controller.signal,
          })
          // Upstream 429 is Polymarket shedding OUR key's load — backing off (serve-stale) is correct;
          // retrying inline would worsen the throttle.
          if (res.status >= 500 || res.status === 429) {
            lastErr = new PolymarketUnavailableError(`polymarket returned ${res.status}`)
            continue
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new PolymarketRequestError(res.status, `polymarket rejected request (${res.status}): ${text.slice(0, 200)}`)
          }
          return await res.json()
        } catch (e) {
          if (e instanceof PolymarketRequestError) throw e
          lastErr = e
        } finally {
          clearTimeout(timer)
        }
      }
      throw lastErr instanceof PolymarketUnavailableError
        ? lastErr
        : new PolymarketUnavailableError(`polymarket unreachable after ${retries + 1} attempts`, lastErr)
    },

    /**
     * POST a JSON body to a CLOB path. Always L2-authed (writes require creds). NOT retried on 5xx —
     * order submission is not idempotent, so a single 5xx surfaces as PolymarketUnavailableError
     * rather than risking a duplicate order. Definitive 4xx -> PolymarketRequestError with the reason.
     * @param {string} path
     * @param {object} body
     */
    async post(path, body) {
      const serialized = JSON.stringify(body)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...l2Headers(creds, { method: 'POST', path, body: serialized, nowSec: nowSec() }),
          },
          body: serialized,
          signal: controller.signal,
        })
        if (res.status >= 500 || res.status === 429) {
          throw new PolymarketUnavailableError(`polymarket returned ${res.status}`)
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new PolymarketRequestError(res.status, `polymarket rejected request (${res.status}): ${text.slice(0, 200)}`)
        }
        return await res.json()
      } catch (e) {
        if (e instanceof PolymarketRequestError || e instanceof PolymarketUnavailableError) throw e
        throw new PolymarketUnavailableError(`polymarket unreachable: ${e?.message || e}`, e)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
