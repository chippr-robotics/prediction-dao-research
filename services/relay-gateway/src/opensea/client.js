/**
 * OpenSea API v2 REST client for the read-only /v1/opensea/* proxy (spec 055).
 *
 * Mirrors src/engine/client.js: thin fetch adapter with a bounded timeout, retries on
 * 5xx/transport errors, and an injectable fetchImpl for tests. Auth is OpenSea's
 * X-API-KEY header — the key never leaves this process (FR-009). GET-only by design:
 * this client cannot express a mutation.
 */

/** OpenSea unreachable / persistent 5xx / upstream 429 — routes serve stale or 503 upstream_unavailable. */
export class OpenSeaUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'OpenSeaUnavailableError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (unknown item/collection, bad cursor) — not retried, not maskable by cache. */
export class OpenSeaRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'OpenSeaRequestError'
    this.status = status
  }
}

/**
 * @param {{baseUrl: string, apiKey?: string|null, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createOpenSeaClient({ baseUrl, apiKey = null, timeoutMs = 5000, retries = 1, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, '')

  return {
    /**
     * GET a v2 path (e.g. '/api/v2/collections/x/stats') with optional query params.
     * @param {string} path
     * @param {Record<string, string>} [query]
     * @returns {Promise<object>} parsed JSON body
     */
    async get(path, query = {}) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))
      const url = `${base}${path}${qs.size > 0 ? `?${qs}` : ''}`
      let lastErr
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const res = await fetchImpl(url, {
            method: 'GET',
            headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
            signal: controller.signal,
          })
          // Upstream 429s are OpenSea shedding OUR key's load — backing off (serve-stale) is the
          // only correct move; retrying inline would make the throttle worse.
          if (res.status >= 500 || res.status === 429) {
            lastErr = new OpenSeaUnavailableError(`opensea returned ${res.status}`)
            continue
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new OpenSeaRequestError(res.status, `opensea rejected request (${res.status}): ${text.slice(0, 200)}`)
          }
          return await res.json()
        } catch (e) {
          if (e instanceof OpenSeaRequestError) throw e
          lastErr = e
        } finally {
          clearTimeout(timer)
        }
      }
      throw lastErr instanceof OpenSeaUnavailableError
        ? lastErr
        : new OpenSeaUnavailableError(`opensea unreachable after ${retries + 1} attempts`, lastErr)
    },
  }
}
