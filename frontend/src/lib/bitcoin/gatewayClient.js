/**
 * Bitcoin gateway client (spec 061, T010) — the SPA side of the relay-gateway's
 * /v1/bitcoin/* proxy (specs/061-bitcoin-transactions/contracts/bitcoin-gateway-api.md).
 *
 * The gateway holds no wallet state and receives BARE ADDRESSES ONLY (never
 * xpubs/descriptors — key-derivation contract invariant 4), ≤50 per request;
 * this client auto-chunks larger sets and merges the pages.
 *
 * Error contract (tested in __tests__/gatewayClient.test.js):
 *  - expected failure classes NEVER throw — every method resolves to a typed
 *    result: { ok: true, … } or { ok: false, error: <slug>, … };
 *  - `stale: true` marks failures where the portfolio must keep rendering the
 *    last-known values, never zero (FR-010 stale-not-zero);
 *  - `disabled: true` marks capability-off verdicts (module unset/disabled/
 *    killswitched) — Bitcoin surfaces soft-fail exactly like the spec-054
 *    "undeployed registry" pattern;
 *  - stamps degrade FAIL-SAFE: a failed or degraded chunk makes the WHOLE
 *    result degraded (unverified coins are then treated as protected, FR-019).
 *
 * Base URL: the relay-gateway is one host for all proxy modules — resolved
 * from VITE_RELAYER_URL exactly like the collectibles/predict clients
 * (lib/collectibles/gatewayClient.js). The constructor stays injectable
 * (baseUrl + fetchImpl) for tests and non-default wiring.
 */

const MAX_ADDRESSES_PER_CALL = 50
const FETCH_TIMEOUT_MS = 10_000

/** networkId (or gateway segment) → the contract's :network path value. */
const GATEWAY_SEGMENT = {
  bitcoin: 'mainnet',
  'bitcoin-testnet': 'testnet',
  mainnet: 'mainnet',
  testnet: 'testnet',
}

function gatewaySegment(network) {
  const segment = GATEWAY_SEGMENT[network]
  if (!segment) {
    throw new Error(`bitcoin gateway: unknown network '${String(network)}' (expected 'bitcoin' or 'bitcoin-testnet')`)
  }
  return segment
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** The configured gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function bitcoinGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Build a client for the five /v1/bitcoin/* endpoints.
 *
 * @param {{baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number}} [opts]
 *   baseUrl defaults to bitcoinGatewayUrl(); '' ⇒ every method reports the
 *   honest capability-off result ({ ok: false, error: 'unconfigured', disabled: true }).
 */
export function createBitcoinGatewayClient({ baseUrl, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const base = (baseUrl ?? bitcoinGatewayUrl()).trim().replace(/\/$/, '')
  const doFetch = fetchImpl ?? ((...args) => fetch(...args))

  async function request(path, { method = 'GET', body } = {}) {
    if (!base) return { ok: false, error: 'unconfigured', disabled: true }

    let res
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        signal: controller.signal,
        ...(body !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      })
    } catch (e) {
      return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'network_error', stale: true }
    } finally {
      clearTimeout(timer)
    }

    let payload = null
    try {
      payload = await res.json()
    } catch {
      /* non-JSON body — handled per status below */
    }

    if (res.ok) {
      if (payload === null) return { ok: false, error: 'bad_response', stale: true }
      return { ok: true, data: payload }
    }

    const slug = payload?.error
    // Capability-off verdicts: module disabled or ops-killswitched (503).
    if (slug === 'bitcoin_disabled' || slug === 'bitcoin_killed' || res.status === 503) {
      return { ok: false, error: slug || 'bitcoin_disabled', disabled: true }
    }
    if (res.status === 429) return { ok: false, error: 'quota', stale: true }
    if (slug === 'upstream_unavailable' || res.status === 502) {
      return { ok: false, error: 'upstream_unavailable', stale: true }
    }
    return {
      ok: false,
      error: slug || `http_${res.status}`,
      status: res.status,
      ...(payload?.message ? { message: payload.message } : {}),
      ...(res.status >= 500 ? { stale: true } : {}),
    }
  }

  return {
    baseUrl: base,

    /**
     * Batch balance + UTXO lookup (POST /addresses). Auto-chunks >50 addresses
     * and merges pages; any failed chunk fails the whole call (with its
     * stale/disabled semantics) — a partial balance would silently under-report.
     * @returns {Promise<{ok: true, tipHeight: number|null, results: object[]} | {ok: false, error: string}>}
     */
    async lookupAddresses(network, addresses) {
      const segment = gatewaySegment(network)
      if (!Array.isArray(addresses)) throw new Error('lookupAddresses: addresses must be an array')
      if (addresses.length === 0) return { ok: true, tipHeight: null, results: [] }

      let tipHeight = null
      const results = []
      for (const batch of chunk(addresses, MAX_ADDRESSES_PER_CALL)) {
        const r = await request(`/v1/bitcoin/${segment}/addresses`, { method: 'POST', body: { addresses: batch } })
        if (!r.ok) return r
        results.push(...(r.data.results ?? []))
        if (typeof r.data.tipHeight === 'number') {
          tipHeight = tipHeight === null ? r.data.tipHeight : Math.max(tipHeight, r.data.tipHeight)
        }
      }
      return { ok: true, tipHeight, results }
    },

    /**
     * Recommended fee rates (GET /fees), sat/vB integers clamped by the gateway.
     * @returns {Promise<{ok: true, rates: {fast: number, normal: number, slow: number}, tipHeight: number} | {ok: false, error: string}>}
     */
    async getFees(network) {
      const r = await request(`/v1/bitcoin/${gatewaySegment(network)}/fees`)
      if (!r.ok) return r
      return { ok: true, rates: r.data.rates, tipHeight: r.data.tipHeight }
    },

    /**
     * Broadcast a raw signed transaction (POST /tx). Upstream rejections come
     * back as { ok: false, error: 'broadcast_rejected', message } — surfaced to
     * the member; the coins stay locally locked-or-released by the caller.
     * @returns {Promise<{ok: true, txid: string} | {ok: false, error: string, message?: string}>}
     */
    async broadcast(network, rawTxHex) {
      if (typeof rawTxHex !== 'string' || !/^([0-9a-fA-F]{2})+$/.test(rawTxHex)) {
        throw new Error('broadcast: rawTxHex must be a hex string')
      }
      const r = await request(`/v1/bitcoin/${gatewaySegment(network)}/tx`, { method: 'POST', body: { rawTx: rawTxHex } })
      if (!r.ok) return r
      return { ok: true, txid: r.data.txid }
    },

    /**
     * Confirmation status (GET /tx/:txid). An upstream 404 is NOT an error —
     * the tx is simply not yet known: { ok: true, found: false } and the caller
     * keeps polling with backoff (contract: "client keeps it pending").
     * @returns {Promise<{ok: true, found: boolean, txid: string, confirmed: boolean, blockHeight?: number, confirmations: number} | {ok: false, error: string}>}
     */
    async getTxStatus(network, txid) {
      const r = await request(`/v1/bitcoin/${gatewaySegment(network)}/tx/${encodeURIComponent(txid)}`)
      if (!r.ok) {
        if (r.error === 'tx_not_found' || r.status === 404) {
          return { ok: true, found: false, txid, confirmed: false, confirmations: 0 }
        }
        return r
      }
      return {
        ok: true,
        found: true,
        txid: r.data.txid ?? txid,
        confirmed: Boolean(r.data.confirmed),
        blockHeight: r.data.blockHeight,
        confirmations: r.data.confirmations ?? 0,
      }
    },

    /**
     * Stamps holdings (GET /stamps). Chunks ≤50 and merges; FAIL-SAFE — the
     * merged result is degraded when ANY chunk reports degraded OR errors
     * (partial stamp knowledge must protect, not spend). Only capability-off
     * verdicts (disabled/killed/unconfigured) fail the whole call.
     * @returns {Promise<{ok: true, degraded: boolean, stamps: object[]} | {ok: false, error: string, disabled: true}>}
     */
    async getStamps(network, addresses) {
      const segment = gatewaySegment(network)
      if (!Array.isArray(addresses)) throw new Error('getStamps: addresses must be an array')
      if (addresses.length === 0) return { ok: true, degraded: false, stamps: [] }

      let degraded = false
      const stamps = []
      for (const batch of chunk(addresses, MAX_ADDRESSES_PER_CALL)) {
        const query = batch.map(encodeURIComponent).join(',')
        const r = await request(`/v1/bitcoin/${segment}/stamps?addresses=${query}`)
        if (!r.ok) {
          if (r.disabled) return r
          degraded = true // fail-safe: unverified ⇒ protected (FR-019)
          continue
        }
        if (r.data.degraded) degraded = true
        stamps.push(...(r.data.stamps ?? []))
      }
      return { ok: true, degraded, stamps }
    },
  }
}
