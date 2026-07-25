/**
 * Across suggested-fees client + normalization for /v1/bridge/* (spec 067, US1).
 *
 * Mirrors src/polymarket/client.js: a thin fetch adapter with a bounded timeout, an injectable
 * fetchImpl for tests, and retries on 5xx/transport. Every bridge route is a READ — the gateway
 * never submits a deposit and never holds a key; the member's own wallet is the only signer
 * (FR-013), so there is no non-idempotent write here to protect from retries.
 *
 * Why this upstream is the only source: a bridge quote depends on Across's relayer-fee oracle and
 * is not derivable client-side (research R10). There is therefore NO honest self-submit fallback
 * for *quoting* — when this upstream is unreachable the route says so and the Bridge surface hides
 * (FR-053). Nothing in this module may synthesize, interpolate, or last-known-value a quote
 * (FR-054): `normalizeSuggestedFees` returns `null` for anything it cannot read verbatim, and the
 * route turns that into an error rather than a guess. An ALREADY-submitted bridge still resolves
 * without the gateway (the client's on-chain event fallback, research R7), so an outage here can
 * never strand value in flight.
 */

/** Across unreachable / persistent 5xx / upstream 429 — routes answer 503 upstream_unavailable. */
export class AcrossUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'AcrossUnavailableError'
    this.cause = cause
  }
}

/** Definitive upstream 4xx (unsupported route, amount below the relayer minimum) — never retried. */
export class AcrossRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'AcrossRequestError'
    this.status = status
  }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const UINT_RE = /^\d{1,78}$/

/**
 * EVM chain ids only. Bitcoin network ids are STRINGS (spec 061) and must never reach a chain-keyed
 * lookup — rejecting them here is the gateway half of FR-006's "Bitcoin is out of scope for bridging".
 * @param {unknown} v raw path/query value
 * @returns {number|null} the parsed chain id, or null when it is not a positive integer
 */
export function parseChainId(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim()
  if (!/^\d{1,10}$/.test(s)) return null
  const n = Number.parseInt(s, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** 0x-prefixed 20-byte address. */
export const isAddress = (v) => typeof v === 'string' && ADDRESS_RE.test(v)

/** Base-unit amount as a decimal integer string (never a float — token amounts are exact). */
export const isAmount = (v) => typeof v === 'string' && UINT_RE.test(v) && v !== '0'

/** Decimal-integer string from a string or a finite number, else null. Nothing is coerced or rounded. */
function uint(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? String(v) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return UINT_RE.test(s) ? s : null
}

/** Across fee legs arrive as `{ pct, total }` (both 1e18-scaled / base-unit integer strings). */
function feeLeg(o) {
  if (!o || typeof o !== 'object') return null
  const pct = uint(o.pct)
  const total = uint(o.total)
  return pct == null || total == null ? null : { pct, total }
}

/**
 * Bounded, retrying JSON GET against the Across API.
 *
 * @param {{baseUrl: string, timeoutMs?: number, retries?: number, fetchImpl?: typeof fetch}} opts
 */
export function createAcrossClient({ baseUrl, timeoutMs = 5000, retries = 1, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, '')

  return {
    /**
     * GET an Across API path with query params.
     * @param {string} path
     * @param {{query?: Record<string, string|number|null|undefined>}} [opts]
     */
    async get(path, { query = {} } = {}) {
      const qs = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
      const url = `${base}${path}${qs.size > 0 ? `?${qs}` : ''}`
      let lastErr
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const res = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal })
          // Upstream 429 is Across shedding OUR load — backing off is correct; retrying inline
          // would worsen the throttle.
          if (res.status >= 500 || res.status === 429) {
            lastErr = new AcrossUnavailableError(`across returned ${res.status}`)
            continue
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new AcrossRequestError(res.status, `across rejected request (${res.status}): ${text.slice(0, 200)}`)
          }
          return await res.json()
        } catch (e) {
          if (e instanceof AcrossRequestError) throw e
          lastErr = e
        } finally {
          clearTimeout(timer)
        }
      }
      throw lastErr instanceof AcrossUnavailableError
        ? lastErr
        : new AcrossUnavailableError(`across unreachable after ${retries + 1} attempts`, lastErr)
    },
  }
}

/**
 * Map an Across `/suggested-fees` body to the gateway DTO, or `null` when it is unusable.
 *
 * A quote is only usable if the three fields the member's decision rests on are present verbatim:
 * the amount that will arrive (`outputAmount`), the relayer fee spread (`totalRelayFee`), and the
 * quote timestamp the deposit must carry. Anything missing => null => the route answers
 * `upstream_malformed` instead of serving a half-quote (FR-054). Everything else is optional and
 * surfaces as `null`, which the client renders as unavailable rather than as zero.
 *
 * Itemization (FR-007) and the FairWins platform-fee line are deliberately NOT done here: the
 * client assembles those from these raw legs plus a live `FeeRouter` read, so the gateway never
 * becomes a second source of truth for a fee (spec 060).
 *
 * @param {unknown} body raw upstream JSON
 * @returns {object|null}
 */
export function normalizeSuggestedFees(body) {
  if (!body || typeof body !== 'object') return null
  const outputAmount = uint(body.outputAmount)
  const totalRelayFee = feeLeg(body.totalRelayFee)
  const quoteTimestamp = uint(body.timestamp)
  if (outputAmount == null || totalRelayFee == null || quoteTimestamp == null) return null

  const limits =
    body.limits && typeof body.limits === 'object'
      ? { minDeposit: uint(body.limits.minDeposit), maxDeposit: uint(body.limits.maxDeposit) }
      : null

  return {
    outputAmount,
    // The three cost legs the client itemizes: LP fee (the bridge protocol's own charge), relayer
    // gas fee (the destination delivery cost), and relayer capital fee. `totalRelayFee` is their sum
    // as Across computes it — served alongside rather than recomputed, so rounding can't drift.
    totalRelayFee,
    lpFee: feeLeg(body.lpFee),
    relayerGasFee: feeLeg(body.relayerGasFee),
    relayerCapitalFee: feeLeg(body.relayerCapitalFee),
    estimatedFillSeconds: Number.isFinite(Number(body.estimatedFillTimeSec)) ? Number(body.estimatedFillTimeSec) : null,
    // `quoteTimestamp` and `fillDeadline` are deposit arguments, not display values — they pin the
    // quote to a block and bound how long a relayer may fill before the member is refunded.
    quoteTimestamp,
    fillDeadline: uint(body.fillDeadline),
    exclusiveRelayer: isAddress(body.exclusiveRelayer) ? body.exclusiveRelayer : null,
    exclusivityDeadline: uint(body.exclusivityDeadline),
    // Informational cross-check ONLY. The address the member actually approves and deposits into
    // comes from the on-chain BridgeRouter at runtime (FR-051) — never from this response.
    spokePoolAddress: isAddress(body.spokePoolAddress) ? body.spokePoolAddress : null,
    limits,
    isAmountTooLow: body.isAmountTooLow === true,
  }
}

/**
 * Fetch + normalize a suggested-fees quote.
 *
 * @param {{get: Function}} client
 * @param {{originChainId: number, destinationChainId: number, inputToken: string, outputToken: string,
 *   amount: string, recipient?: string|null}} params
 * @returns {Promise<object|null>} the DTO, or null when the upstream body is unusable
 */
export async function fetchSuggestedFees(client, { originChainId, destinationChainId, inputToken, outputToken, amount, recipient = null }) {
  const body = await client.get('/suggested-fees', {
    query: {
      originChainId,
      destinationChainId,
      inputToken,
      outputToken,
      amount,
      // Optional: lets Across price the fill for the actual recipient (contract deposits cost more
      // to fill than EOAs). Omitted when the caller has not chosen one yet.
      recipient,
    },
  })
  const quote = normalizeSuggestedFees(body)
  if (quote == null) return null
  return { originChainId, destinationChainId, inputToken, outputToken, inputAmount: amount, ...quote }
}
