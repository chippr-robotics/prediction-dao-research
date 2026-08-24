/**
 * HTTPS client for the FairWins member API and the gateway's public read routes (spec 095).
 *
 * Contract: specs/095-member-api-agentic-access/contracts/member-api.md, and the document the
 * gateway serves at /v1/member/openapi.json.
 *
 * WHAT THIS CLIENT IS ALLOWED TO DO. It reads, and it asks the gateway to QUOTE typed data. There
 * is no route in here that moves value and no credential that could: the bearer token is a
 * member-signed capability grant that authorises the gateway to answer questions about that member,
 * never to act as them. The member signs in their own wallet, elsewhere.
 *
 * THREE PROPERTIES THAT ARE NOT INCIDENTAL:
 *
 *   AN UPSTREAM FAILURE IS REPORTED, NEVER SUBSTITUTED. Every non-2xx answer becomes an `ApiError`
 *   carrying the gateway's OWN `{ error: { code, reason } }` verbatim. Nothing here converts a
 *   failed read into an empty list, a zero, or a `false` — an agent that is told "no wagers" when
 *   the truth is "the indexer timed out" will go on to say something untrue to a member.
 *
 *   MISSING CONFIGURATION IS A FIRST-CLASS STATE, NOT A CRASH. With `FAIRWINS_API_URL` unset the
 *   client is `configured: false` and every call fails with `api_unconfigured` and an instruction.
 *   The server still speaks MCP, so a client gets a real message instead of a dead pipe.
 *
 *   EVERY CALL IS BOUNDED. `AbortController` plus a timer, always cleared. An agent waiting forever
 *   on a hung socket is indistinguishable from one that has crashed.
 *
 * X402 (spec 096): THIS SERVER CARRIES PAYMENTS, IT NEVER MAKES THEM. The gateway may answer a
 * priced operation with `402 Payment Required` and a machine-readable list of what it would accept.
 * That answer is surfaced to the calling agent whole (see `PaymentRequiredError`) — this process
 * holds no key, so it cannot sign the EIP-3009 authorization the offer asks for, and there is no
 * configuration that changes that. An agent that CAN sign sends the resulting `X-PAYMENT` header
 * back in and it is forwarded upstream verbatim; the settlement receipt the gateway returns
 * (`X-PAYMENT-RESPONSE`) is handed back the same way.
 */

/** The default per-request budget. The gateway's own upstream reads are bounded well inside this. */
const DEFAULT_TIMEOUT_MS = 15_000

/** A failure that is safe and useful to show an agent: it names a code and a reason. */
export class ApiError extends Error {
  constructor(code, reason, { status = null, retryAfterSec = null } = {}) {
    super(reason)
    this.name = 'ApiError'
    this.code = code
    this.reason = reason
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * A `402 Payment Required` answer, carried whole (spec 096).
 *
 * It is an `ApiError` so every existing failure path keeps working unchanged, and it adds the one
 * thing a paying agent needs: the offer itself. `accepts` is passed through EXACTLY as the gateway
 * wrote it — amounts, asset address, `payTo`, the network in CAIP-2 form and the token's own EIP-712
 * domain in `extra`. Rewriting, rounding or "helpfully" normalising any of that would change what
 * the agent signs, and a payment authorization that does not match the offer is simply refused.
 *
 * This is NOT a failed read. It is a priced answer the caller has not paid for yet, which is why it
 * carries its own code rather than reusing `http_402`.
 */
export class PaymentRequiredError extends ApiError {
  constructor({ x402Version = null, accepts = [], resource = null, error = null, status = 402 } = {}) {
    super('payment_required', 'this operation is priced and no payment accompanied the request', { status })
    this.name = 'PaymentRequiredError'
    this.x402Version = x402Version
    this.accepts = Array.isArray(accepts) ? accepts : []
    this.resource = resource
    /** The gateway's own machine code for WHY, when it named one (e.g. a rejected payment). */
    this.paymentError = error
  }
}

/**
 * Decode a base64 `X-PAYMENT-RESPONSE` settlement receipt, or return null.
 *
 * Never throws: a receipt this process cannot read is a receipt it reports as opaque, not a reason
 * to fail a call whose data already arrived. The raw header is kept alongside so the HTTP transport
 * can hand the original bytes back to the agent that paid, unaltered.
 */
export function decodeSettlement(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    return JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Drop the trailing run of `/`.
 *
 * Scanned rather than matched: `replace(/\/+$/, '')` is quadratic on a rejecting input, and this
 * runs over configuration a caller supplies. One pass, same result.
 */
function stripTrailingSlashes(value) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/** Normalise a base URL, or return null when it is unusable. Never throws — absence is a state. */
export function normalizeBaseUrl(value) {
  const raw = typeof value === 'string' ? stripTrailingSlashes(value.trim()) : ''
  if (!raw) return null
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  return raw
}

/**
 * Pull `{ error: { code, reason } }` out of a gateway error body.
 *
 * The gateway-wide shape is nested; the Bitcoin module's is flat (`{ error, message }`) because its
 * contract predates the convention. Both are recognised so an honest upstream code survives the
 * trip to the agent either way.
 */
function readErrorBody(body, status) {
  if (body && typeof body === 'object') {
    const nested = body.error
    if (nested && typeof nested === 'object' && typeof nested.code === 'string') {
      return { code: nested.code, reason: typeof nested.reason === 'string' ? nested.reason : `HTTP ${status}` }
    }
    if (typeof nested === 'string') {
      return { code: nested, reason: typeof body.message === 'string' ? body.message : `HTTP ${status}` }
    }
  }
  return { code: `http_${status}`, reason: `the gateway answered HTTP ${status}` }
}

/**
 * @param {{
 *   baseUrl?: string,
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   userAgent?: string,
 * }} options
 */
export function createApiClient({
  baseUrl,
  token = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = 'fairwins-mcp',
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  const envToken = typeof token === 'string' ? token.trim() : ''

  function requireBase() {
    if (base) return base
    throw new ApiError(
      'api_unconfigured',
      'FAIRWINS_API_URL is not set to an http(s) URL, so this server has no gateway to ask. ' +
        'Set it to the FairWins gateway base URL (for example https://relay.fairwins.app) and restart the MCP server.'
    )
  }

  function bearerFor(override) {
    const chosen = typeof override === 'string' && override.trim() ? override.trim() : envToken
    if (chosen) return chosen
    throw new ApiError(
      'token_missing',
      'No member API token was supplied. Set FAIRWINS_API_TOKEN to a token created in the FairWins app ' +
        '(Settings ▸ API access), or send one per request as an Authorization: Bearer header in HTTP mode. ' +
        'This server never creates a token — only the member’s own wallet can sign one. ' +
        'If this gateway offers pay-per-request access (x402), an agent that can sign a USDC payment may ' +
        'call this tool with an X-PAYMENT header instead of a token; call get_gateway_status first to see ' +
        'whether it is enabled and what each operation class costs, and read fairwins://guide for the flow.'
    )
  }

  /**
   * Normalise a caller-supplied `X-PAYMENT` value, or return null.
   *
   * The header is opaque to this server — base64 JSON that only the gateway and the token contract
   * interpret — so it is forwarded byte-for-byte after a shape check. A value carrying a line
   * terminator never was a header value and is dropped rather than smuggled into the request.
   */
  function paymentHeader(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/[\r\n\u2028\u2029]/.test(trimmed)) return null
    return trimmed
  }

  async function call(
    method,
    path,
    { query = null, body = null, auth = 'required', token: override, xPayment = null, onSettlement = null } = {}
  ) {
    const root = requireBase()
    const url = new URL(root + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue
        url.searchParams.set(k, String(v))
      }
    }

    const headers = { accept: 'application/json', 'user-agent': userAgent }
    const payment = paymentHeader(xPayment)
    // The token rides in a header. It is never put in the URL, never logged, and never echoed back
    // into a tool result.
    //
    // A supplied payment SUBSTITUTES for the token on this call and no Authorization is sent: on the
    // paid rail the gateway serves the request as the PAYER, so presenting somebody else's bearer
    // alongside a payment would be asking two different questions in one request. Sending both would
    // also be the shape in which a member is quietly charged for a request their membership already
    // covers — the bearer path is checked first upstream and is never priced.
    if (payment) headers['x-payment'] = payment
    else if (auth === 'required') headers.authorization = `Bearer ${bearerFor(override)}`
    if (body != null) headers['content-type'] = 'application/json'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new ApiError('api_timeout', `the gateway did not answer ${method} ${path} within ${timeoutMs}ms`)
      }
      throw new ApiError('api_unreachable', `the gateway at ${root} could not be reached: ${err?.message ?? String(err)}`)
    } finally {
      clearTimeout(timer)
    }

    const text = await res.text()
    let parsed = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }

    // x402: a 402 is an OFFER, not a failed read, so it is decoded before the generic error mapping —
    // which would otherwise flatten the whole `accepts` list into the string "http_402" and leave the
    // agent with a price it cannot see. A 402 whose body is not an x402 offer falls through to the
    // ordinary mapping rather than being reported as an offer with nothing in it.
    if (res.status === 402 && parsed && typeof parsed === 'object' && Array.isArray(parsed.accepts)) {
      throw new PaymentRequiredError({
        x402Version: parsed.x402Version ?? null,
        accepts: parsed.accepts,
        resource: parsed.resource ?? null,
        error: typeof parsed.error === 'string' ? parsed.error : (parsed.error?.code ?? null),
        status: res.status,
      })
    }

    if (!res.ok) {
      const { code, reason } = readErrorBody(parsed, res.status)
      const retryAfter = Number.parseInt(res.headers?.get?.('retry-after') ?? '', 10)
      throw new ApiError(code, reason, {
        status: res.status,
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : null,
      })
    }
    if (parsed === null) {
      throw new ApiError('invalid_response', `the gateway answered ${method} ${path} with a body that is not JSON`)
    }

    // The settlement receipt for a payment that was just spent. Reported through the caller's sink
    // rather than folded into the body: the body is the gateway's answer and must stay exactly what
    // the gateway said. The raw header is kept so the HTTP transport can return the original bytes.
    if (typeof onSettlement === 'function') {
      const raw = res.headers?.get?.('x-payment-response') ?? null
      if (raw) onSettlement({ raw, decoded: decodeSettlement(raw) })
    }
    return parsed
  }

  return {
    /** True when a base URL is set and usable. False is a state to report, never an exception. */
    configured: Boolean(base),
    baseUrl: base,
    /** True when this process holds a token of its own. A per-request token can still be supplied. */
    hasToken: Boolean(envToken),
    get: (path, options) => call('GET', path, options),
    post: (path, options) => call('POST', path, { ...options, body: options?.body ?? {} }),
  }
}
