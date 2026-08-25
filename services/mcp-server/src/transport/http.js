/**
 * MCP HTTP transport (spec 095) — `node:http`, no framework.
 *
 * Routes:
 *   POST /mcp      one JSON-RPC message per request; the response is that message's answer
 *   GET  /healthz  { status: 'ok' } — liveness for the container and the platform
 *   *              404, with the gateway-style nested `{ error: { code, reason } }` body
 *
 * PER-REQUEST AUTHORIZATION. `Authorization: Bearer <token>` on the POST overrides
 * `FAIRWINS_API_TOKEN` for that request only, and is forwarded upstream — never stored, never
 * logged, never written into a URL. That is what lets ONE process serve several members without
 * holding any of their credentials: the caller brings their own token per call.
 *
 * PER-REQUEST PAYMENT (spec 096). `X-PAYMENT` on the POST is forwarded upstream unaltered, and the
 * gateway's `X-PAYMENT-RESPONSE` settlement receipt is returned on this response. This is the ONLY
 * mode in which a payment can travel: stdio has no per-call header, and an environment variable
 * cannot carry a single-use, per-request authorization — a payment payload that could be reused
 * from configuration would be a standing withdrawal, not a payment. The stdio path therefore
 * documents its absence rather than approximating it.
 *
 * WHY THERE IS NO CORS HEADER, AND WHY THAT IS NOT AN OVERSIGHT.
 * MCP clients are agents and editors, not browsers: they speak HTTP directly and never perform a
 * preflight, so CORS buys this endpoint nothing. What it would cost is real. An
 * `Access-Control-Allow-Origin: *` here means any web page the member happens to have open can
 * script requests at a server that is, by design, holding a member's capability token — and with an
 * env token configured, every one of those requests would be authenticated as that member. If a
 * browser surface ever needs this, it belongs behind an explicit origin allow-list with the reason
 * written down, exactly as the relay gateway does it — never a wildcard.
 *
 * WITHHOLDING CORS IS NOT A DEFENCE, AND THAT IS WHY `ORIGIN` IS CHECKED BELOW.
 * The paragraph above was true about what this server SENDS and wrong about what it therefore
 * PREVENTS. CORS governs whether a browser lets a page READ a response; it does not govern whether
 * the request is sent, and it does not govern whether the server executes it. A POST whose
 * `Content-Type` is one of the three CORS-safelisted values — and `text/plain` is one — is a simple
 * request: no preflight, sent straight through, executed here in full. The page cannot read the
 * answer, which bounds this to the tools that MATTER for having been called rather than for what
 * they return; but combined with the `FAIRWINS_API_TOKEN` shared-identity path, "cannot read the
 * answer" is the only thing that was ever standing between an arbitrary web page and a member's
 * capability token. Measured before this check existed: `POST /mcp` with `Content-Type: text/plain`
 * and `Origin: https://evil.example` answered 200 with a full tools listing.
 *
 * So the `Origin` header is validated, as the MCP Streamable HTTP specification requires of every
 * server ("servers MUST validate the Origin header on all incoming connections", the stated purpose
 * being DNS-rebinding defence — an attacker's name resolving to 127.0.0.1 reaches a loopback-bound
 * server, but the page's Origin still says the attacker's host).
 *
 *   absent Origin  → served. A non-browser client — curl, an agent runtime, an editor — sends none,
 *                    and a browser cannot omit one. Absence is therefore evidence of NOT being the
 *                    thing this check defends against, and treating it as a rejection would break
 *                    every real MCP client to stop nobody.
 *   loopback       → served, always. `http://localhost:*`, `http://127.0.0.0/8:*`, `http://[::1]:*`
 *                    and their https spellings. A rebinding attacker's page keeps ITS origin, so
 *                    this grants them nothing; what it does grant is the MCP Inspector and every
 *                    other local browser-based debugging tool.
 *   allow-listed   → served. Exact origin match, `--allowed-origin` / FAIRWINS_MCP_ALLOWED_ORIGINS.
 *   anything else  → 403 `origin_not_allowed`. Including the literal `Origin: null` a sandboxed
 *                    iframe or a `file://` page sends: that is a present origin that is not on the
 *                    list, not an absent one.
 *
 * A NOTIFICATION IS ANSWERED WITH 202 AND NO BODY. There is no JSON-RPC response for a
 * notification, and an empty `200` with a JSON content-type is a lie about what is in the body.
 */
import { createServer } from 'node:http'

/** Request bodies are small — one JSON-RPC message. Anything larger is refused, not buffered. */
const MAX_BODY_BYTES = 256 * 1024

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // This endpoint is an API for programs. Nothing here should ever be cached or framed.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(payload)
}

function sendError(res, status, code, reason) {
  sendJson(res, status, { error: { code, reason } })
}

/**
 * Read a request body, never buffering past the cap.
 *
 * Once the cap is passed nothing more is kept — the remaining bytes are drained and discarded so the
 * request can still be ANSWERED with a 413. Destroying the socket at the moment the cap is crossed
 * would be cheaper and is what a first draft does, but the client is then still writing and sees a
 * connection reset instead of the explanation, which is indistinguishable from the server having
 * crashed. A caller that keeps going far past the cap (`HARD_MULTIPLE`) has stopped being a mistake,
 * and gets the reset.
 */
const HARD_MULTIPLE = 8

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        tooLarge = true
        chunks.length = 0
        if (size > maxBytes * HARD_MULTIPLE) {
          req.destroy()
          resolve({ text: '', tooLarge: true })
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), tooLarge }))
    req.on('error', reject)
  })
}

/** The one authentication scheme this endpoint understands, matched case-insensitively. */
const BEARER_SCHEME = 'bearer'

/**
 * Characters a `.` cannot match. A credential containing one never matched the scheme grammar, so
 * it stays a rejection here rather than becoming a token with a newline in it.
 */
const LINE_TERMINATORS = ['\n', '\r', '\u2028', '\u2029']

/**
 * Extract a bearer token, or null. A malformed header is treated as absent, never as an error.
 *
 * MATCHED BY HAND, NOT WITH A REGULAR EXPRESSION, AND THAT IS THE POINT. The obvious spelling —
 * `/^Bearer\s+(.+)$/i` — takes quadratic time on a rejecting header, because `\s+` and `.+` both
 * match a space: for `Bearer` followed by n spaces and then something `.+` cannot reach the end of,
 * the engine retries every one of the n ways to split that run. This value is whatever a caller
 * sent, and Node will hand us up to `--max-http-header-size` bytes of it before this function is
 * ever called. The scan below is a single pass.
 */
/**
 * Extract an `X-PAYMENT` payload, or null (spec 096).
 *
 * The value is an opaque base64 PaymentPayload that only the gateway and the token contract can
 * interpret, so it is taken as-is after a shape check and forwarded upstream unaltered. This server
 * neither builds nor validates a payment — it carries one.
 *
 * A payment payload is a signed authorization to move a caller's money. It is therefore treated with
 * the same care as the bearer token: read from a header, never from a URL or a tool argument, never
 * logged, and never echoed into a tool result.
 */
export function paymentFrom(headers) {
  const raw = headers?.['x-payment'] ?? headers?.['X-Payment']
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (LINE_TERMINATORS.some((c) => value.includes(c))) return null
  return value
}

/**
 * Normalise an origin to its canonical `scheme://host[:port]` form, or null if it is not one.
 *
 * `new URL()` does the parsing and the default-port folding, so `https://a.example:443` and
 * `https://a.example` are the same entry and cannot both have to be listed. Null comes back for
 * everything that is not an http(s) origin — the literal string `null`, a `file://` page, a value
 * with a path on it, two comma-joined Origin headers, and any other garbage. Every one of those is
 * a REJECTION at the gate, never a pass: this function's null means "not an origin I can vouch
 * for", and the caller must not read it as absence.
 */
export function normalizeOrigin(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // A URL carrying a path, query or fragment was never an Origin header value.
  if (url.pathname !== '/' || url.search || url.hash) return null
  return url.origin
}

/** 127.0.0.0/8 — the whole loopback block, not just the one address people type. */
const LOOPBACK_V4 = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isLoopbackOrigin(origin) {
  const { hostname } = new URL(origin)
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const v4 = LOOPBACK_V4.exec(hostname)
  return Boolean(v4) && v4.slice(1).every((octet) => Number(octet) <= 255)
}

/**
 * Decide what to do with a request's `Origin`, given the extra origins an operator allow-listed.
 *
 * Returns `{ allowed, origin }` where `origin` is the normalised value when there was one and null
 * when the header was absent — the two cases a caller has to be able to tell apart, because only
 * one of them is a browser.
 */
export function originDecision(rawOrigin, allowedOrigins = new Set()) {
  if (rawOrigin === undefined || rawOrigin === null) return { allowed: true, origin: null }
  const origin = normalizeOrigin(rawOrigin)
  if (!origin) return { allowed: false, origin: null }
  if (isLoopbackOrigin(origin)) return { allowed: true, origin }
  return { allowed: allowedOrigins.has(origin), origin }
}

/**
 * Render a rejected origin back to its sender, safely.
 *
 * The value is attacker-controlled, so it is truncated and stripped of anything that is not
 * printable ASCII before it goes anywhere. It is echoed at all because the overwhelmingly common
 * reason to see this response is a developer running a browser-based MCP client on an origin they
 * have not listed yet, and a 403 that will not say which origin it disliked makes them guess.
 */
function describeOrigin(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return 'an unreadable Origin header'
  const safe = raw.slice(0, 128).replace(/[^\x20-\x7e]/g, '?')
  return `"${safe}"`
}

export function bearerFrom(headers) {
  const raw = headers?.authorization ?? headers?.Authorization
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) return null
  const rest = trimmed.slice(BEARER_SCHEME.length)
  const token = rest.trimStart()
  // Empty is "Bearer" with nothing after it; unchanged length is "Bearerfoo", where the scheme and
  // the credential were never separated. Both are malformed, and both are absence.
  if (token.length === 0 || token.length === rest.length) return null
  if (LINE_TERMINATORS.some((c) => token.includes(c))) return null
  return token
}

/**
 * @param {{
 *   handle: (message: object, ctx: object) => Promise<object|null>,
 *   parse: (text: string) => object,
 *   onParseError: (err: unknown) => object,
 *   maxBodyBytes?: number,
 *   allowedOrigins?: Iterable<string>,
 *   log?: (message: string) => void,
 * }} deps
 * @returns {import('node:http').Server}
 */
export function createHttpTransport({
  handle,
  parse,
  onParseError,
  maxBodyBytes = MAX_BODY_BYTES,
  allowedOrigins = [],
  log = () => {},
}) {
  const allowed = new Set()
  for (const entry of allowedOrigins) {
    const normalized = normalizeOrigin(entry)
    // An unparseable entry is dropped rather than stored, so it can never match by accident. The
    // command line refuses these outright; this is the belt for a programmatic caller.
    if (normalized) allowed.add(normalized)
  }

  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]

    // BEFORE ROUTING, and before a single byte of body is read. One gate rather than a decision
    // per route: a route added later inherits the check instead of having to remember it, and a
    // rejected browser learns nothing about which paths exist.
    const origin = originDecision(req.headers.origin, allowed)
    if (!origin.allowed) {
      return sendError(
        res,
        403,
        'origin_not_allowed',
        `this server does not serve browser requests from ${describeOrigin(req.headers.origin)}. ` +
          'Requests carrying no Origin header — curl, an agent runtime, an editor — are served normally. ' +
          'To allow a browser origin, start the server with --allowed-origin <origin> (repeatable) or set ' +
          'FAIRWINS_MCP_ALLOWED_ORIGINS.'
      )
    }

    if (path === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendError(res, 405, 'method_not_allowed', 'GET /healthz')
      }
      return sendJson(res, 200, { status: 'ok' })
    }

    if (path === '/mcp') {
      if (req.method !== 'POST') {
        // No OPTIONS handler either: without CORS there is nothing a preflight could be told that
        // would make a browser call succeed, and answering one would only imply otherwise.
        return sendError(res, 405, 'method_not_allowed', 'POST /mcp with a single JSON-RPC message')
      }

      let raw
      try {
        const read = await readBody(req, maxBodyBytes)
        if (read.tooLarge) {
          return sendError(res, 413, 'too_large', `the request body exceeded ${maxBodyBytes} bytes`)
        }
        raw = read.text
      } catch {
        return sendError(res, 400, 'bad_request', 'the request body could not be read')
      }

      let message
      try {
        message = parse(raw)
      } catch (err) {
        // A JSON-RPC parse error is a protocol-level answer, so it goes back as 200 with an error
        // object rather than as an HTTP 400: the client's JSON-RPC layer is what has to see it.
        return sendJson(res, 200, onParseError(err))
      }

      try {
        // The per-request token wins over the process's own. It travels no further than the
        // upstream call this request makes. `xPayment` rides alongside it for exactly one hop, and
        // `ctx.settlement` is where the upstream receipt comes back — see below.
        const ctx = { token: bearerFrom(req.headers), xPayment: paymentFrom(req.headers) }
        const response = await handle(message, ctx)
        // The settlement receipt goes back to whoever paid, as the ORIGINAL bytes the gateway sent.
        // Re-encoding a receipt this server did not produce would put our signature-shaped claim
        // where the gateway's belongs; the payer verifies the transaction, not our paraphrase of it.
        const receipt = ctx.settlement?.raw ? { 'x-payment-response': ctx.settlement.raw } : {}
        if (!response) return res.writeHead(202, receipt).end()
        return sendJson(res, 200, response, receipt)
      } catch (err) {
        log(`[fairwins-mcp] request failed: ${err?.message ?? String(err)}`)
        return sendError(res, 500, 'internal_error', 'the request could not be handled')
      }
    }

    return sendError(res, 404, 'not_found', 'this server serves POST /mcp and GET /healthz')
  })
}
