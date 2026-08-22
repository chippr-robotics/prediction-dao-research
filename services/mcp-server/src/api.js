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

/** Normalise a base URL, or return null when it is unusable. Never throws — absence is a state. */
export function normalizeBaseUrl(value) {
  const raw = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
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
        'This server never creates a token — only the member’s own wallet can sign one.'
    )
  }

  async function call(method, path, { query = null, body = null, auth = 'required', token: override } = {}) {
    const root = requireBase()
    const url = new URL(root + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue
        url.searchParams.set(k, String(v))
      }
    }

    const headers = { accept: 'application/json', 'user-agent': userAgent }
    // The token rides in a header. It is never put in the URL, never logged, and never echoed back
    // into a tool result.
    if (auth === 'required') headers.authorization = `Bearer ${bearerFor(override)}`
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
