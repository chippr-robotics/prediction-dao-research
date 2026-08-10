/**
 * Bitcoin upstream clients for the /v1/bitcoin/* proxy (spec 061).
 *
 * Two fetchers, mirroring src/polymarket/client.js (bounded timeout, injectable fetchImpl,
 * retries on 5xx/transport for reads, NO retry for the broadcast write):
 *
 * - createEsploraClient: an Esplora-compatible REST upstream (mempool.space, blockstream.info,
 *   self-hosted electrs — all speak the same dialect; research R4). One instance per network
 *   (mainnet/testnet4), base URLs from config. Fee recommendations prefer the mempool.space
 *   `/fees/recommended` shape and fall back to Esplora's `/fee-estimates` when the first 404s.
 * - createStampsClient: a stampchain.io-compatible Bitcoin Stamps indexer (research R6). The
 *   exact upstream path is isolated in ONE function so an indexer swap is a one-line change.
 *
 * The gateway holds no Bitcoin keys of any kind — these are pure data reads plus a raw-tx
 * broadcast relay of a transaction the member signed client-side.
 */

/** Upstream unreachable / persistent 5xx / upstream 429 — routes answer 502 upstream_unavailable. */
export class BitcoinUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'BitcoinUnavailableError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (unknown tx, rejected broadcast) — not retried, not maskable by cache. */
export class BitcoinRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'BitcoinRequestError'
    this.status = status
  }
}

/**
 * Shared HTTP core: text-first (Esplora answers plain text for tip height and broadcast,
 * JSON everywhere else), bounded timeout, retries only when `retryable`.
 */
function createRequester({ baseUrl, timeoutMs, retries, fetchImpl, label }) {
  const base = baseUrl.replace(/\/+$/, '')

  async function text(path, { method = 'GET', body, contentType, retryable = method === 'GET' } = {}) {
    const attempts = retryable ? retries + 1 : 1
    let lastErr
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}${path}`, {
          method,
          headers: { accept: 'application/json', ...(contentType ? { 'content-type': contentType } : {}) },
          ...(body != null ? { body } : {}),
          signal: controller.signal,
        })
        // Upstream 429 is the public API shedding OUR load — backing off (serve-stale at the
        // route layer) is correct; retrying inline would worsen the throttle.
        if (res.status >= 500 || res.status === 429) {
          lastErr = new BitcoinUnavailableError(`${label} returned ${res.status}`)
          continue
        }
        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          throw new BitcoinRequestError(res.status, `${label} rejected request (${res.status}): ${detail.slice(0, 200)}`)
        }
        return await res.text()
      } catch (e) {
        if (e instanceof BitcoinRequestError) throw e
        lastErr = e
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr instanceof BitcoinUnavailableError
      ? lastErr
      : new BitcoinUnavailableError(`${label} unreachable after ${attempts} attempt(s)`, lastErr)
  }

  async function json(path, opts) {
    const raw = await text(path, opts)
    try {
      return JSON.parse(raw)
    } catch {
      throw new BitcoinUnavailableError(`${label} returned non-JSON for ${path}`)
    }
  }

  return { text, json }
}

/**
 * Esplora-compatible client for one network.
 * @param {{baseUrl: string, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createEsploraClient({ baseUrl, timeoutMs = 5000, retries = 1, fetchImpl = fetch }) {
  const http = createRequester({ baseUrl, timeoutMs, retries, fetchImpl, label: 'esplora' })

  return {
    /** GET /address/:addr — chain_stats/mempool_stats funded/spent sums (balances). */
    async getAddress(address) {
      return http.json(`/address/${encodeURIComponent(address)}`)
    },

    /** GET /address/:addr/utxo — unspent outputs with per-UTXO confirmation status. */
    async getAddressUtxos(address) {
      return http.json(`/address/${encodeURIComponent(address)}/utxo`)
    },

    /**
     * Recommended fee rates. Prefers the mempool.space shape (GET /fees/recommended ->
     * {fastestFee, halfHourFee, hourFee, ...}); a 404 (blockstream.info / plain electrs)
     * falls back to Esplora's GET /fee-estimates ({"<target>": satPerVb, ...}).
     * normalizeFeeRates() detects whichever shape comes back.
     */
    async getFees() {
      try {
        return await http.json('/fees/recommended')
      } catch (e) {
        if (e instanceof BitcoinRequestError && e.status === 404) {
          return http.json('/fee-estimates')
        }
        throw e
      }
    },

    /**
     * POST /tx — broadcast a raw signed transaction (hex string as a text/plain body).
     * Success returns the txid (plain text). NOT retried: re-posting after an ambiguous
     * failure gives no benefit (same-tx rebroadcast is a no-op upstream, but we keep the
     * platform's writes-never-retry idiom). A definitive rejection surfaces the upstream
     * reason via BitcoinRequestError for the broadcast_rejected mapping.
     */
    async broadcastTx(rawTxHex) {
      const txid = await http.text('/tx', { method: 'POST', body: rawTxHex, contentType: 'text/plain', retryable: false })
      return txid.trim()
    },

    /** GET /tx/:txid/status — {confirmed, block_height, ...}; upstream 404 while unknown. */
    async getTxStatus(txid) {
      return http.json(`/tx/${encodeURIComponent(txid)}/status`)
    },

    /** GET /blocks/tip/height — current chain tip (plain-text integer). */
    async getTipHeight() {
      const raw = await http.text('/blocks/tip/height')
      const height = Number.parseInt(raw, 10)
      if (!Number.isInteger(height) || height < 0) {
        throw new BitcoinUnavailableError(`esplora returned a non-numeric tip height: ${String(raw).slice(0, 40)}`)
      }
      return height
    },
  }
}

/**
 * Stamps indexer client (stampchain.io-compatible). Optional infrastructure: when unconfigured
 * or failing, the stamps route answers `degraded: true` and the CLIENT fail-safes by treating
 * unverified coins as protected (research R6 / FR-019) — never the other way around.
 * @param {{baseUrl: string, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createStampsClient({ baseUrl, timeoutMs = 5000, retries = 1, fetchImpl = fetch }) {
  const http = createRequester({ baseUrl, timeoutMs, retries, fetchImpl, label: 'stamps indexer' })

  return {
    /**
     * Stamps balance for one address. The EXACT stampchain.io API v2 path is isolated here —
     * swapping to another compatible indexer means changing only this line (plus BTC_STAMPS_URL).
     * The response shape is treated as untrusted: normalizeStampsBalance() parses defensively
     * and an unrecognizable body degrades the whole result (fail-safe), never throws to clients.
     */
    async getStampsBalance(address) {
      return http.json(`/api/v2/stamps/balance/${encodeURIComponent(address)}`)
    },
  }
}
